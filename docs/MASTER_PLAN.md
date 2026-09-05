# THE MASTER PLAN — one file, one project: a closed circuit

**Read §1 before touching anything.** §2 is the map, §3 IS THE WORK (one ordered project; take the
first step), §4 the gates, §5 the lessons, §6 the watchlist, §8 the pointers to the two archive files,
§9 the ledger of what is done. §1–6 are the plan and stay brief; the archives §8 names are
appendices you read at the step that needs one. There is no second rules
file and no second work list — §3 is the only list and it holds only what is still open.

**A note on `§7.N`.** 699 code comments cite `§7.N` — the ORIGINAL numbered records, which live in
git at `79c239b:docs/MASTER_PLAN.md`. §5 keeps every lesson the code still cites at its original
number, so a `§7.N` citation still resolves. There is deliberately no section 7 here, so the
citation can never be misread as one.

**WHERE THE WORK STANDS — read this first on a handover.**
- HEAD on `claude/master-plan-review-qbp6qp`, the branch this session was given; rule 14 says
  every commit goes there AND to `main`.
- **Take §3's first open step, finish it, stop** (rule 10 states it in full). Do not write a "next
  step" note here naming anything but §3's first line; one was written, it disagreed with §3's
  order, and two steps were skipped behind it.
- **There is no current violation count and there is not meant to be one** (rule 11). The harness
  is deliberately red: what it prints is the unbuilt half of §3, so a count taken now measures how
  much list is left, not whether a change was good. The reference to judge against is
  `SHOCKS=0 WEEKS=16` at step 38, and the last one taken — **231 in 46**, money family clean — is
  history, not a target. Do not open a run to explain a print.
- **Recording a step:** delete it from §3 and write ONE ENTRY in §9, newest first — what changed,
  why, the measured numbers (rule 16 says how long). A lesson a FUTURE step could trip over goes in §5 as well; nothing else does.

**Where this list came from (2026-09-02): a line-by-line audit of ~230 files / ~55k lines**, which
found ~380 defects. Every material one is a step in §3 at its file:line (or, once done, in §9), and
**the sweep in full is in `docs/AUDIT_ARCHIVE_2026-09-02.md` (§8 points at it) so nobody re-derives
it** — including the long tail that did not earn a step. It is a record, not a work list, and it was NOT re-verified: treat a finding there as a lead
with a file:line. The headline that set the order: money and ownership do NOT close, price is NOT
universal (credit trades at par, commodity spot is a drift formula), and the instrument that
measures all this is itself broken (the wires family never prints, the per-bank identity check has
never fired). The atlas (§9, `docs/systems/`) then found what a sweep structurally cannot: what is
ABSENT.

## 1. RULES OF ENGAGEMENT

Standing user directives. Not suggestions. Nineteen; none of them restates another.

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

14. **One bounded commit per step, pushed to the branch the session was given AND `main`.** Never
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

19. **READ THE SOURCE. DO NOT RE-DERIVE IT.** (user, 2026-09-05: *"a lot of the data now is present
    inside the entities and doesn't need to be calculated anymore"*, and *"this needs to apply to all
    the changes we're making — if there is a property from an object that's the source that needs to
    be used"*.) Every fact in this model has ONE place that holds it: the register holds who holds
    what and in what UNITS, `v2.tranches` holds the ladder, `v2.prices` holds what a market printed,
    `v2.accounts` holds money. Where such a place exists, code READS it. It does not recompute the
    fact, sum a second copy of it, infer it by subtraction, or model a price the market already
    printed. This is rule 4 pointed at the READ side, and it has four failure modes, all of them
    measured in this repo:

    · **The wrong quantity.** Reading `qtyLocal` (the MARK) where the question is FACE, or the
      reverse. Two numbers that were equal at par and stopped being equal the week prices moved.
    · **The stale mirror.** Reading `itemizedHoldings` or `debtTranches` mid-week. Those arrays are
      a WEEK-END VIEW materialized at the close; between the store's build and its write-back they
      are week-start snapshots and the rows are the authority.
    · **The residual.** Inferring a holding as `total − Σ(known holders)`. A residual with no holder
      is rule 2's defect; now that the household sector and the desks have real books, the
      subtraction has no remaining excuse.
    · **The re-derived price.** Discounting to a price for an instrument whose own auction printed
      one. A bidder's RESERVATION is legitimately its own opinion and is not this; a MARK is not an
      opinion.

    So: before adding a derivation, name the store that already answers it. When changing a site,
    convert it. **Every deletion under this rule names the read that replaces it** — that is what
    makes it a deletion rather than a guess.

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
- **Real economy** — 03-category-demand, trade-settlement, goods-arrival,
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
commit, gated by §4. The 2026-09-02 sweep behind the older steps is in
`docs/AUDIT_ARCHIVE_2026-09-02.md` (§8) — read the step's area before starting it. A finished step
is deleted from here and recorded in §9, so this list is always exactly what is left. **FILE ORDER
IS THE ORDER. A step's number is its identity, not its rank** — 28b sits after 29, 33–36 sit before
30, 20-LLR opens PART IV — because a step is inserted where its dependencies put it and keeps the
id it was born with. Later parts depend on earlier ones — do not reorder.

### PART I — THE CIRCUIT CLOSES (money and ownership leak nowhere) — **CLOSED**

Every step is in §9. What PART II is written against, kept here because `O8` tests it every week:

**THE KEY POLICY** (user, 2026-09-03; step 12, §9.12):
· a COMPANY is its `id`; its `ticker` is a display name and a party address, never a key into a
  store (`company.id` is `${region}_${ticker}`, so the two are derivable but not equal);
· an INSTITUTION is its `id`;
· a PIECE OF PAPER is the instrument it IS — a TRANCHE id for credit AND for a sovereign (rule 9:
  there is no bucket), the company id for equity, the fund's id for a fund share;
· a GOOD is its sub-unit id, a CONTRACT its own id, and what a contract is ON is keyed the way
  that thing is keyed above.

**THE MONEY-NAMING RULE** (user, 2026-09-03; step 13c, §9.13c-RENAME — every monetary identifier
written from here):
  · a figure in its OWNER's own money → `…Local` (the word `convertLocal` already uses);
  · a figure whose currency is named beside it — a `currency` field or parameter in the same
    object or signature — → NO suffix, because the unit is already stated (rule 8);
  · a figure genuinely in the numéraire → `…USD` STAYS, and now means it;
  · a figure in a named OTHER party's money → `…BuyerMoney` / `…SellerMoney`, the shape
    `exWorksBuyerMoney` and `valueBuyerMoney` already use.

### PART II — THE INSTRUMENTS ARE REAL

13. **EVERY ASSET TRADES ON PRICE — AND THE STRUCTURE HAS TO CHANGE, NOT THE CREDIT BOOKS**
    *(37-SEED handed this step two findings it already owns. **(a)** the seed's spread table is the
    permanent CASH FLOW of every bond the world opened with — `RATING_OAS_SPREADS` strikes every
    coupon and loan margin in `generateDebtTranches`, so a cleared spread in week one moves the
    price and never the coupon. It has nowhere else to go until the SEED itself clears (atlas
    the-seed E1); §9.13-CREDIT row 1 narrowed it to the coupons alone — the seed now deposits an
    opening PRICE per tranche off the same table and nothing reads the table again after week 1.
    **(b)** `O7`, 409 tranches claimed beyond their face by $439.28 — the seed rounds each holder's
    slice on its own, so the slices sum past the face. Still open, and now visible one book at a
    time: the bond book repays a claim on retired paper instead of migrating it, so what is left of
    `O7` on CORP_BOND is the seed's rounding alone.)*
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
    4. **THE STORED VALUE FIELD IS STILL A FIELD**, on equity and credit both. `register-marking`
       re-derives every row's value from its own quantity at the close, so what is stored is now a
       CACHE of `units × price` rather than an independent number — but this step's structure ends
       at *"value is a FUNCTION, never a field"*, and a cache re-derived once a week is one step
       short of that. Slice (f) is where it goes.
    5. **THE REGISTRY MUST BE WHAT THE ADAPTER READS** (atlas corporate-credit D2, point 3):
       `assets/index.ts` declares `quotedAs` and every adapter hard-codes `statKind` beside it —
       two representations of one fact. §9.13-CREDIT row 1 added a third agreement rather than
       removing the second, and row 4 then found the DECLARATION itself wrong (`LEVERAGED_LOAN`
       still read `SPREAD_LIKE` a row after its book started printing prices) — which is the
       point: nothing reads `quotedAs`, so nothing could have caught it. `COMMERCIAL_PAPER` is not
       even an `AssetType`, so the registry cannot describe the book at all. Slice (d) closes it.

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
    goes, and households become holders) → **inventory at cost versus price** (the new
    holding-gain mechanism) → **goods** (the price already exists and is discarded) → **plant and
    housing** (units must be defined before anything else is possible — step 26 owns that
    decision). Each class is its own commit and each is expected to move the numbers.

    **THE FINISHED CLASSES ARE IN §9** — 13-SOV, 13-CREDIT, 13-EQUITY, 13-BILL, 13-READ (its
    C2.a and D13 leftovers included) and **13-BOOK, whole** (a–g: the id spaces, the entity
    registry, the instrument index, the contract store, the liens, the one kind list, the position
    book as lots with a basis, the goods, the accruals, the dwellings and the plant on it), so
    **inventory at cost versus price is the next class**. What is left open of the survey, and
    nothing else:

    **13-INV — INVENTORY AT COST VERSUS PRICE.** The class step 13's item 2 calls *a NEW
    MECHANISM, not a refactor*. What is true today, read (not run) and each claim cited at its
    site: a firm's finished stock is `{unitsHeld, valueLocal}` per sub-unit with **no cost basis
    anywhere** — every weekly write recomputes `valueLocal = units × a price`, so the warehouse is
    revalued UP when the market rises (`goods.md` E2.c's exact FORBID: profit the firm has not
    earned), DOWN when it falls, and neither move is an event anybody books (E3 has no writer at
    all). Seven slices, in this order, because each one is load-bearing for the next:

    ii. **ONE MARK A WEEK, AND THE FILED NUMBER IS THE STOCK.** Three defects of one shape.
       `setOutputStock` marks the row mid-week at LAST week's landed anchor while
       `settleOutputInventory` re-marks it at THIS week's ex-works cleared price — two prices on
       one row in one week, and a contract-only supplier (the `?? getOutputInventoryUnits`
       fallback) keeps the anchor mark all the way to stage 08. The FILED balance sheet reads
       `newOutputInventoryBySubUnit`, the pre-merge base, while the firm keeps the merge, so the
       filed finished-goods number and the firm's own stock **are already two different numbers**.
       And the front pass's carrying-cost write-down is discarded by that merge for every sub-unit
       stage 05 settled, so the one write-down in the model is dead.
    iii. **THE GOODS PRICE IS STORED** — step 13's item 3, *the cheapest half of the whole step*.
       The auction's cleared price per `region|subUnit` goes in `v2.prices` (whose own header
       already names `setOutputStock` as the same defect one asset class over); the region's
       `exWorksUnitPriceLocal` and stage 05's anchor become reads of it. Nothing can re-mark a
       warehouse next week until the price outlives the week that made it.
    iv. **WHAT A UNIT COST TO MAKE IS AN HONEST NUMBER.** The pipeline books the whole line's
       weekly operating cost against that week's batch, so a throttled week inflates the unit cost
       and a zero-unit week makes it INFINITE; the weather's yield loss shrinks `arrivedUnits` and
       leaves the value whole, so the survivors absorb the cost of the lost; and a virgin pipeline's
       first touch mints `lead` weeks of cost from nothing. Nothing reads any of it today, which is
       why it has never been audited — a cost basis built on it would be worthless.
    v. **FINISHED STOCK IS LOTS AT COST.** Not a GOOD row: the register permits exactly one GOOD
       row per (firm, sub-unit) and `openGoodsPass` addresses chains by `firmRow × NSUB + sub`, so
       a second chain is silently orphaned — and merging the two would make the recipe draw consume
       a firm's own output as an input. A DISTINCT KIND is invisible to both (each filters on the
       GOOD typeRef) and to `register-marking`, which prices only tranches, sovereigns and equity —
       so a basis parked there cannot be silently marked to market, which a field on `Company`
       could. The audit's goods snapshot switches to the rows in the SAME commit: it sums the
       record and the rows into one `region|subUnit` key, so both at once double-counts W4 in
       week one.
    vi. **LOWER OF COST AND NET REALISABLE VALUE** (`goods.md` E2/E2.a/E2.c/E3, the user's *"apply
       real world facts"*). Cost until the market falls below it, then written down to market, and
       **the write-down is a charge to income in the period it happens** — E3's missing writer.
       The write-up never happens. A sale realises its margin against the lot's own cost, which is
       F5's COGS: today the input draw is expensed in the week it is DRAWN, whatever was made or
       sold. This is where the numbers move, and step 13 says they must.
    vii. **THE FIELD GOES.** Readers take the rows; the value half of `outputInventoryBySubUnit` is
       deleted; the dead carrying-cost write-down becomes a real charge or goes with it.

    · **13-NS — THE CONTINUOUS-VERSUS-DISCRETE CONVENTION** (step 12b, §9.12b, carried out of the
      finished 13-BOOK block): `engine/nelsonSiegel.ts` discounts CONTINUOUSLY (`exp(-z·t)`) where
      `domain/pricing/` compounds discretely — two answers to one question (rule 4). Four sites
      still take `curvePointAt(…).rate`, a continuously-compounded zero, as a coupon or a
      discrete discount rate: `11-fiscal` (two coupon strikes), `stage08-back` (a refinancing's
      risk-free) and `macro/initialization` (the seed's coupons). Step 25 gave the point its
      traded flag and left the convention; the point should hand back the rate in the convention
      the pricing compounds in, once, at its one owner. Three more are PERMITTED and are not
      work: `07f` (a bill bidder's own reservation, `bond.md` N7.b), `sovereign-curve` (the fit's
      one owner PUBLISHING it) and `audit/prices` (`P6` MEASURING the fit against the cleared
      points).

### PART III — NOTHING IS BOUNDED (rule 6)

### PART IV — EVERY PRICE IS CLEARED (rule 3)

### PART V — THE INSTRUMENT TELLS THE TRUTH

28b-ii. **The histories' one-week lag belongs at the type.** `historicalPolicyRates`,
    `historicalInflation`, `historicalCoreInflation`, `historicalGdpGrowth`, `historicalWageGrowth`,
    `historicalDebtToGdp` and `historicalZeroCurves` are appended by the macro evolution AFTER the
    measurement stages run, so a same-week reader sees history through LAST week — documented once
    at `region-macro.ts` (P1) and visible to no reader. Give each history the week its newest entry
    is through (`historicalZeroCurves` already carries a `week` on the row; the rest are bare
    arrays), so a reader that wants "this week's" is told it is reading last week's, and pin it.
    Part of 28b (the units sweep, rule 8): 28b-i walked the region's rates and flows at the point
    they are WRITTEN and named their period and money in the identifier — see §9.

28b-iii. **The company's, bank's and household's rates and flows name their period and money.**
    The same walk 28b-i made over `Region`, over `Company`, `BankingSector`, `HouseholdState`,
    `OccupationPool`, `CreditTierBook` and the SME pools: every rate, flow and index at the point
    it is WRITTEN, its period confirmed at the source and named in the identifier, each pinned in
    `test/units.test.ts`. The price level is part of the walk — 28b-i found the trade position
    stored in USD under a `…Local` name for years, and every stored money field's suffix is checked
    against its writer the same way. Step 15 fixed the unit bugs the audit found at the point they
    are RENDERED; this is the same class of error caught at the source.

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
the code, ~1,400 nodes marked, every citation machine-checked (the gate prints the live count). It produced **331 findings**, of
which 217 were already steps here or are measurements for step 38. The remaining **114 are new**,
and they are consolidated below into the steps that actually close them — a finding is not a step,
and twenty trees reporting one cause is one step, not twenty.

**Ids are suffixed on 37 because that is where they came from**, matching the plan's own convention
(13-SOV, 20-LLR, 21-BRACKET). Each step names the tree NODES it closes, so the atlas and the plan
cannot drift apart: when the step lands, those nodes are re-marked in the same commit.

**Ordered by what unblocks what.** The two verification steps (37-SEED, 37-ZEROSUM) ran first and
are in §9; what is left here opens with the single causes that each disable a whole channel, then
the absent systems, in the order their absence distorts the most. **37-GOODS-RECIPE is deliberately
last** — it moves every input-output number in the model, so it needs a stable measurement to land
against. **The trees still say "Becomes a §3 step" where they mean one of these** — a tree names the
step that owns its node; where it does not yet, the step below is the owner.

**Added 2026-09-04 from the review of the atlas** — nine findings the trees had marked "Becomes a
§3 step" that no step here owned: 37-LOANBOOK, 37-OVERDRAFT, 37-OPENFUND, 37-VIEW, 37-FIRMCOST,
37-BANKEQUITY, 37-BIRTH, 37-SECURITISE, 37-EMPLOYMENT, plus ten one-commit items into 37-SMALL. Each is inserted at its dependency position, not appended.

37-LOSSRATE. **A LOSS RATE IS NOT A DEFAULT, AND FOUR SYSTEMS RUN ON ONE.** (banks-lending E1/E2;
    sme-pools E1, A3/B4; firm-birth-and-death C2.a pooled tier, E3; housing C4/C4.a; cds D1;
    households A2.d/E4 — the threshold is on a band mean, never a cell; and downstream of it
    banks-capital D1/D2.a — a resolution cannot value the book it takes until a loan can be worth
    less than its face.)
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

37-LOANBOOK. **A BANK'S LOANS ARE NOT A BOOK, THEY ARE FIELDS ON ITS SHEET.** (banks-lending F1/F1.a,
    A3.a/A3.b, D4; sme-pools B1/B2; housing C1/C6; households D2.) The corporate facility is a
    tranche with one writer. Everything else a bank lends — the SME pool rows, the mortgage
    vintages, the consumer pools, the central-bank loan — is a `Record` on `bankBalanceSheet`,
    written by 02b, `bank-lending`, `bill-accretion`, `bank-transfer` and the seed, with no
    register, no issued side, no wire and no lender-of-record walk. So a loan cannot be sold,
    pooled, pledged or matured, and `F1.a`'s FORBID (*no loan-book number that is not Σ(loans)*)
    holds only because the sum IS the field. After 37-LOSSRATE gives a pooled loan an event, each
    loan becomes a row in 13-BOOK's position store with the bank as holder and the borrower as
    issuer, behind the ledger's door — which is what lets 37-SECURITISE move it. Medium.

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

37-OPENFUND. **NO VEHICLE IN THE MODEL HAS A CLAIM ITS INVESTOR CAN REDEEM.** (fund-shares
    C2/C3/C4/C5, A2/A3; hedge-funds A2, D5.a; insurers-and-pensions A2.a/A2.b. The SALE the
    redemption forces is 37-MARGIN's — C2.b, C4.a, D5 — and this step is the CLAIM it needs.) The ETF
    redeems in kind — correct for an ETF, and it means the forced-seller channel the fund tree calls
    "the point" is absent from the largest fund complex; a hedge fund's investors hold a scalar with
    no share count and cannot ask for their money back; a household ETF redemption is rationed by the
    fund's cash and the unfilled part is dropped. One redeemable claim, used by the mutual-fund and
    hedge-fund vehicles: a share count, a redemption request, a sale in the SAME week's books, and
    the cost of a late sale landing on the holders who stayed (C4.a). Pairs with 37-MMF (same
    representation, one class over) and 37-MARGIN (the other forced seller). Medium.

37-COSTOFCAPITAL. **NOBODY PAYS FOR MONEY, SO PRICE CANNOT REACH A DECISION.** (banks-funding B2/B2.a;
    20d's growth-versus-margin orientation lands here: when the investment decision becomes a
    project with a return and a hurdle, the hurdle is the management's own cost of capital
    weighted by its `riskAversion` and the horizon its `patienceWeeks` — an orientation read off
    the two primitives, not a stated posture.)
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

20d-iv. **A product line can be ENTERED.** (Sits after 37-COSTOFCAPITAL because entering a line is
    an investment project: plant for a good the firm does not yet make.) A firm whose industry's
    registry lists a sub-unit it does not produce, in a category that is short
    (`categoryShortfall` is already read by the capital programme), enters it when the project
    clears its hurdle — the new line's plant is commissioned through the same
    `capexUnderConstruction` lag as any capex, it posts nothing until the plant is in service,
    and its revenue share is what it then sells. Entry and exit (20d-ii) together are what
    makes a sector's line-up an outcome.
37-BANKEQUITY. **A BANK CANNOT RAISE CAPITAL, AND IT HAS ONE LAYER OF IT.** (Also here, from
    20-LLR-iv: what one bank's run says about the others — `banks-funding-and-liquidity.md` E5 —
    the contagion of a failure across the sector's funding, which a bank with only retained
    earnings for capital cannot answer.) (banks-capital
    A2.b/A2.c, A3, C2/C2.a/C2.b, B2; banks-funding A3.) No bank issues equity —
    `evolveBankingSector` records the old equity-rescale write as deleted and says a bank "stays
    undercapitalized until a real equity raise exists" — and no bank issues a subordinated tranche,
    so the ladder that gets bailed in is SENIOR paper and depositors are never touched: one layer
    short at the top, one over-punished in the middle, and a breach goes straight to closure. The
    bank's financing decision joins `corporate-financing.ts` (it runs for every firm and a bank is a
    firm): an equity issue priced by 07e's book that can fail, a subordinated tranche in the ladder
    with `seniority` finally written, and B2's buffer as the bank's own choice rather than
    `BANK_WORKING_CAPITAL_RATIO`. Medium; after 37-COSTOFCAPITAL, which gives the raise a price.

37-FIRMCOST. **A THIRD OF EVERY FIRM'S COST BASE IS THE GAP TO ITS SEEDED MARGIN.** (firm-fundamentals
    B4/B4.a/B5, C1/C2, F2; trade-credit A2, C4.) `front-core.ts:683` strikes `otherOpexRate` as
    `1 − baselineMargin − inputs − payroll/revenue` on the seed week and applies it as a fixed share
    of revenue for ever — perfectly variable by construction, so operating leverage comes only from
    payroll and D&A and the seeded margin is an attractor. Beside it: reported receivables and
    payables are `revenue × 0.08 × {0.6, 0.4}` while the real invoice book is `state.tradeInvoices`
    (two representations, rule 4, and `changeInWorkingCapital` reads the stated one); and
    `baselineAnnualRevenue` compounds on `(potentialGdpGrowth + targetInflation)/52` and is then
    differenced against measured revenue to make the region's health signal. Three commits, each a
    deletion into a read: named cost lines with real payees, receivables as Σ(invoice book), and
    the baseline as last year's measured revenue. Small each; sequenced before 37-COSTOFCAPITAL's
    decision reads them.

37-OVERDRAFT. **THE TREASURY HAS A CENTRAL-BANK OVERDRAFT, AND IT IS THE FUNDING MECHANISM.**
    (the-treasury D3/D4/D4.b/D5/A1.a; sovereign-credit A3.b/A2.b/H4 and the whole of G;
    the-central-bank E2/D4; bond N12/N13 · sov; ratings E1's sovereign half.) The user's own
    FORBID, stated in three trees, and the code has its opposite: `accounts.ts:waysAndMeansOf` is
    `max(0, −treasuryNetOf)`, `11-fiscal:647` makes it the FIRST TERM of the quarterly issue, the
    interest on it round-trips through remittance in the same week, and nothing approves, caps or
    refuses it. So the treasury spends into an overdraft and issues to clear it, D4.b's buffer is
    unnecessary, a failed auction costs nothing, and a sovereign cannot fail — which is why
    `07c` prices its paper with `hasCreditRisk: false` and why the sovereign rating reaches five UI
    strings and nothing else. Two commits: (1) the account is a balance like any other — the
    programme is sized forward against redemptions and outlays (D4, A2.a), the buffer exists, and a
    shortfall is a real event; (2) a sovereign can default — a missed-payment definition, an
    exchange offer with holdouts, market exclusion, and the rating gains its first consumer.
    Sequenced here because 37-BENCHMARK and every price struck over the sovereign curve assume a
    borrower with no funding constraint. Medium.

37-FX-CROSS. **THE MARKET CLEARS SIX PAIRS AND THE LEDGER READS THREE.** (fx-spot E3/A3/C3;
    fx-forwards-and-xcs A1.c/B1/E1 — the forward RATE is spot moved by a cleared basis, with no
    interest differential in it, so nothing can be checked against parity; A1.b/A2/E3, A4, D3;
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

37-VIEW. **THREE DERIVATIVE BOOKS HAVE TWO PARTICIPANTS AND BOTH ARE HEDGERS.** (interest-rate-swaps
    B4/B5/B1; cds B3 buy side/B4; commodity-futures B5; the-derivative-layer B3; dealer-desks
    C4/B2 — a desk never learns whom it faced — and E1/E2/E3 — no cash desk hedges and no cash
    book has an interdealer market.) Every swap is
    struck between a bank whose repricing loss binds and a pension closing a duration gap; every CDS
    buyer is a bank above its large-exposure limit; the commodity desk appears only as a carry
    arbitrageur and only on the sell side; `dealerSpreadBps: 0` in all three. So the cleared par
    rate, spread and curve are functions of regulatory gaps and never of a view, a week in which
    neither gap binds does not open the book, and the swap spread cannot move because somebody
    thinks rates are wrong. 17f's `RELATIVE_VALUE` book is the natural home for the speculator;
    the two-sided desk is `dealer-desks.md` C5's replacement quote posted into these books too.
    Sequenced after 37-CDS-DIRECTION, which is what lets a view disagree with the accounting
    model. Medium.

37-ESTATE. **TRADE CREDITORS RANK NOWHERE, AND THREE SMALLER ABSENCES OF A DEATH.**
    (trade-credit D2; firm-birth-and-death D6.a, D1, D4/D4.a. The derivative half — a dead
    party's derivatives paid in full ahead of every ranked claim, the-derivative-layer E2/E3 —
    closed with 17-iv-c-ii: the close-out is the clearing house's unsecured claim on the estate.)
    In the estate, **trade creditors rank nowhere while the estate COLLECTS the dead firm's
    receivables as an asset**, so recoveries — and the model's calibrated recovery rate — are biased high by exactly
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
    had **no writer at all** — seeded 0, rendered on two screens, permanently 0.0% — and §9.15-iii
    deleted the field and its two prints (the screens show the trade balance, a read); the
    current account is this step's to build as a READ of the transactions, never a stored field.
    No financial account exists. Every ingredient exists and is unjoined: exports and imports from real
    fills, income via the register, and `fx-clearing` already computes each entity's change in
    foreign holdings by issuer region. Small-to-medium, and it is the read that would have shown
    every cross-border defect this atlas found by hand.

37-COMMODITY. **THERE IS NO COMMODITY STOCK — NOT A BAD ONE, NONE.** (commodities-spot
    D2/D2.a/D5/F1/F2, A1.a/A4/D3/C3/B4, E1/E3/E4; commodity-futures C4.a/D2, B3.a/D3/E3,
    B4/C1.a, A1.a/A2.) `Commodity.inventoryLevelPct` is a **percentage on a random walk in [0,100]**,
    untouched by production or consumption and not an input to the price; supply and demand units
    are the auction's own since §9.22, but nothing reconciles them to a stock. So the identity
    `produced + opening = consumed + closing` has two of its four terms. Every commodity's PRICE is
    a read of its goods sub-unit since §9.22; its STOCK, LOCATION and HOLDER are not. Downstream, futures converge by an ENFORCED boundary because nothing can be
    delivered, there is no roll, and the carry arbitrageur cannot store. Large; §9.22 took the spot
    walk and both elasticities, and this is the half it did not cover (`inventoryLevelPct`'s walk
    now lives in `07-commodities.ts`). The goods side's W4 units identity is the machinery it needs.

37-HOUSING. **A DEFAULT SEIZES NO HOUSE, AND THE LENDING STANDARD NEVER TIGHTENS.** (housing C4/C4.a,
    C5, A3; after 26b-ii.) 26b-i gave the owner-occupied stock its units, its owner and its wire
    (`HousingMarket.ownerOccupiedUnits`, `ledger/dwelling-ledger.ts`, W7); 26b-ii makes the price
    a book. What is left of the cycle's other half: `vLossLocal` (`bank-lending.ts`) reduces a
    vintage's principal and the bank's P&L and **no house is repossessed, nothing is sold, and no
    foreclosed supply reaches the market** — the extra supply that makes a falling price fall
    further does not exist; a foreclosure is a HOUSE wire from the household sector to the
    estate (or the bank) and the estate's sale at the book is what it fetches (C4.a). And **the
    lending standard never tightens** — `MORTGAGE_DSTI_LIMIT` and `MORTGAGE_LTV_AT_ORIGINATION`
    are constants no code path writes — so only the rate channel loops: the bank already measures
    everything a standard should respond to (`mortgageSeverity` off its own LTV cross-section,
    `bankHurdle`, `headroomLocal`), so the two constants become reads of the same measurements
    the quote already uses (C5, C5.a). The rental stock has no dwelling behind it (A3): a landlord
    is a firm producing a service, not the owner of a dwelling somebody lives in. Medium.

37-SECURITISE. **THE INSTRUMENT HALF OF THE SME SYSTEM DOES NOT EXIST.** (sme-pools C1–C6, D1–D4.a,
    E2/E3; housing C6; banks-capital D2's other side.) Zero hits in `src` for a vehicle, a tranche
    on a pool, a loss waterfall, or a holder of pool risk other than the originating bank. So SME
    and mortgage credit risk sits on the bank that wrote it for ever, a bank's origination can
    never be expanded by selling risk, and the event this system exists to produce — correlation
    worse than the tranching assumed, every holder hit at once — has no holders to hit. Needs a
    named vehicle party, a tranche instrument with a cleared price, a stated waterfall, and named
    holders; blocked on 37-LOSSRATE (tranching a loss RATE yields senior notes that can never be
    touched) and on 37-LOANBOOK (a loan has to be a row before it can be transferred). Large; the
    same step gives housing C6 its pool.

37-MANDA. **THERE IS NO M&A MARKET. THERE IS A COIN FLIP.** (20d's acquisition intent lands here:
    an acquirer's intent is its own valuation of the target — the target's expected earnings at
    the acquirer's hurdle — against the price, formed by its management, never a screen
    threshold.) (m-and-a B5/B2/B2.a/B3/B4/C1/C2/C3,
    E3/A4, D4.) `merger.ts:24` fires `random() < 0.20`, quarterly, at most one deal in the world,
    at `marketCap × 1.15`. No funding test, no acceptance, no rival bidder, no walk-away — so the
    credit market does not decide which deals happen and a target's owners cannot refuse. Two
    synergies are assumed straight into the combined firm (`revenue × 0.85`, `heads × 0.75`) and
    the headcount saving destroys jobs with no separation event. `D5` is one of the few present
    nodes: the money really does move acquirer → target → holders of record. §3 has no M&A step at
    all. Medium.

37-EMPLOYMENT. **THERE IS NO EMPLOYMENT RELATIONSHIP, ONLY A HEADCOUNT.** (labour A4, A1, C2/C3,
    D2/D2.b; households B1.) `employeeCount` is an integer on the firm and a worker is a fraction
    spread across five occupations by the sector's fixed mix, so a hire and a separation are
    additions to a count: there is no contract with a wage and a term, nothing for stickiness to be
    a consequence OF (`MARKET_WAGE_CATCHUP_SPEED_WEEKLY = 0.15` stands in), nothing a severance
    payment could sever, and no household that can be told its earner lost a job. This is the
    non-financial twin of 13-BOOK: a register of employment rows (firm, cohort, wage, start week)
    behind one door, from which the wage bill, the unemployment rate and the separation flow are
    reads. §9.24-i cleared the matches on the bid without it; what still needs it is D2.b
    (stickiness as the contract's), the quit elasticity and the vacancy withdrawal rate (a
    posting an employer owns, a quit a worker does to it), and 37-SMALL's labour C2/C3. Medium;
    after 37-MANDA, which is the largest consumer of a transfer of employees.

37-BIRTH. **A FIRM'S AGE IS WRITTEN AND NEVER READ, AND THE ENTRANT'S SIZE IS A CONSTANT.**
    (firm-birth-and-death B2, A4.a; m-and-a E3's headcount half. D1, D4/D4.a and D6.a — the death
    side — are 37-ESTATE's.) `Company.bornWeek` is
    read by a trace, a log tag and a headline; no rating, spread, term or lending decision is a
    function of it, and the rating's volatility notch returns 0 below three prints, so a newborn
    scores best. An entrant's opening size is `pool revenue × 0.004` whatever the opportunity. A
    MERGED firm's headcount saving (`employeeCount += target × 0.75`) deletes a quarter of the
    target's workers in one statement — the same absence 37-ESTATE closes for a death. Three
    commits, each small: the age enters the assessment, the size is what the founders can fund, and
    a merger routes its headcount change through the labour market's own separation path. After
    37-LOSSRATE, which owns what a pooled death IS.

37-SECLENDING. **THE LENDER LOSES THE DIVIDEND AND PAYS FOR THE PRIVILEGE.** (securities-lending
    A3/A5.b, C1, C5/B3, D1, B2.a/C3 — posted cash collateral is spendable capacity.) No manufactured payment exists anywhere — `payHoldersCash` pays the
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
    and `PartyRef` has no PLAYER. The read surface is a full god-view — correct for
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
    · **short-term-debt B4** — a committed backstop is free, with no commitment fee on undrawn
      headroom *(A2/E2 and sovereign-credit F2, listed here before, closed at §9.13-BILL)*;
    · **households D5.a** — MMF shares are issued pro rata and never chosen, so the deposit / money
      fund / bill substitution never happens, and **F2** — nobody inherits anything;
    · **labour B1** — participation moves by a constant keyed off a regime label with the wage
      nowhere in it *(the reservation half landed at §9.24-ii; this is whether a household posts itself at all, and for how many hours)*, and **C2/C3** — firing has no cost, only a pair of speeds;
    · **freight E2** — `laneFillRatio` and `shippedShareByLaneSubUnit` are computed and read by
      nobody, so capacity sets the PRICE of distance and never the QUANTITY;
    · **goods B1.b** — `inputSupplyConstraintFactor` reaches only the UI;
    · **equity A5/F3** — there is no vote, so a take-private extinguishes the register without a
      tender anyone can refuse, and **C4** — `accrueInstitutionalIncome` skips every EQUITY row, so
      a holder's equity P&L reaches no income statement;
    · **private-equity B5** — LBO sources and uses do not balance: sellers are paid the equity
      cheque while the debt proceeds stop at the target;
    · **banks-lending F3** — no large-exposure limit, and `09-concentration-risk.ts:82` says in its
      own comment that it measures something else;
    · **derivative D10.a, cds E2** — no reservation in any of the four books carries a term for the
      COUNTERPARTY, so a weak dealer never loses flow and wrong-way risk can cost nobody anything;
    · **banks-capital D3.b/D6** — the assuming bank is assigned, not choosing: its bid IS
      `estateLocal`, and a resolution with no bid falls through to the public path that exists;
    · **banks-funding D4/D4.a, banks-lending B2.b** — origination is gated by capital alone, so a
      bank out of cash and collateral writes the same book as one flush with reserves;
    · **fx-forwards B3/C4** — *closed at §9.17b-iv-b: `evolveFxPair` and `FxPair.basisSpreadBps` are
      gone; the basis clears in the swap book and the forward prices off it*;
    · **freight B4** — nothing ever blocks a route (with E2, in that order);
    · **m-and-a D4** — `trade-settlement` writes off every invoice against an ACQUIRED firm as if
      it had died, because `isActiveCompany` conflates the two;
    · **insurers B4, C3** — claims are `premium × ratio` for every policy, so a catastrophe has no
      representation; and no insurer or pension is an LP, so the illiquidity it is paid for earns
      it nothing;
    · **private-equity A2/A2.a** — a capital call is bounded by the LP's spare cash, so it is never
      an obligation: the LP funds it from its own liquidity ladder or defaults on it;
    · **the-central-bank C2/E4** — the treasury makes a central-bank loss good the same week, so the
      deferred-asset case cannot occur.

37-GOODS-RECIPE. **THE RECIPE IS A VALUE SHARE, SO EVERY INPUT SUBSTITUTES UNIT-ELASTICALLY.**
    (goods A2.a.) `recipeInputs` is cents-per-dollar-of-revenue and the draw is
    `neededUnits = neededUSD / inputUnitPrice`, so **a price doubling halves the physical draw.**
    That is the strongest substitution assumption there is, sitting where the tree chose Leontief,
    and it is invisible from the code — which reads as an ordinary units calculation. It changes
    every input-output result in the model, so it is listed last deliberately: it must land when
    there is a stable measurement to land it against, and its A/B is the whole point of it.
    Large. **Do not start it before 37-SEED and 37-ZEROSUM.**

### PART VIII — MEASURE ONCE (rule 11)

13-ATLAS-GATE. **A CITATION MUST RESOLVE TO A SYMBOL, NOT TO A MENTION.** Inserted by §3.13-READ
    part B, which found it by tripping it. `check-atlas.sh` proves that every `file:symbol` in
    `docs/systems/*.md` still resolves, and it does that by searching the file's TEXT — so a
    citation is satisfied by the symbol appearing in a COMMENT. Deleting `buildRegisterIndex` left
    the gate green, because the replacement file's own docstring names it while explaining that it
    is gone. This is the gate CLAUDE.md tells the reader to trust for "a cited `file:symbol` stops
    resolving", and it is the one that catches a deletion, so a comment satisfying it is the whole
    hole. The fix is to resolve against a DECLARATION — `export (function|const|class|type|interface)
    <symbol>`, a class member, or a bare `function <symbol>` — and to keep the current text search
    only as the fallback for the handful of citations that name something else (a field, a literal).
    Cheap: it is a grep pattern change in one script, and the existing citations are the test —
    any that stop resolving are either a real rot or a citation that should have named a declaration.


13c-FX-3. **THE FX NET IMBALANCE — MEASURE, THEN DECIDE.** *(All the rest of 13c is done, §9.13c-*.
    This is the one bullet that cannot be closed by reading, so it sits HERE, beside the run that
    settles it, rather than as an open bullet on a finished step.)* §9.13c-FX-2
    stopped the runaway and did not stop the drift: the desks' book opens at −45.8B in week 1
    (was −390.6B) and reaches −181.3B net / 227.2B gross by week 16, about −8.5B a week off a
    small base rather than +53B a week off a huge one. What is left is a persistent ONE-WAY net
    trade flow that the elastic side of the FX book cannot absorb — `residualByPair`, which the
    stage already publishes as its own liquidity diagnostic. Three candidates and none of them
    is obvious, which is why this is a step and not a fix: the elastic side is genuinely too
    small (a capacity question — XB2b's number); the flow is genuinely one-way and something
    real should be financing it (a capital-account question, and a persistent trade imbalance
    financed by the banking system IS a real phenomenon); or the invoice-currency convention in
    `05-unit-bidding` makes it one-way by construction.

    **That third candidate is the whole of what was listed separately as "stage 05's household
    leg", and the two are one question.** The firm leg converts the price to BUYER money inside
    the auction (`exWorksBuyerMoney`) and pays in buyer money, so no short arises and no order is
    placed; the household leg keeps the ORIGIN price and pays in origin money, so the buyer IS
    short and must buy it. Same auction, same purchase, and the FX flow lands somewhere different
    depending on who bought.

    **The decision, stated so the measurement knows what it is deciding:** ONE convention for
    what money a goods payment settles in, owned in one place. The mechanism-consistent answer is
    the SELLER's — a factory-gate price is quoted in the seller's money, and 13c-FX already
    established that a payment moves one currency and a party short of it BUYS it. That would
    delete `exWorksBuyerMoney`'s price conversion: a conversion with no counterparty, the same
    defect 13c-FX deleted at the ledger, still standing inside the auction. It cannot be settled
    by reading, because flipping the firm leg makes every importing firm short the seller's money
    and turns a price conversion into real orders — and whether the book absorbs that IS
    candidate one. There is no interim shape either: a function returning today's two answers
    would have to switch on the BUYER'S KIND, which rule 15 forbids. Measure first (step 38); per
    rule 11 do not judge the levels on the way.
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
| `npx eslint src scripts test --no-warn-ignored --max-warnings 0` | **zero.** Type-aware since §9.29-ii; the 1,565 it found were paid in §9.29-iii/iv, `no-unnecessary-condition` is an error, and a warning is a failure |
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
`BANK_IDENTITY_TRACE`, `COMPANY_STORE_AUDIT`,
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
§9.13-CREDIT row 2: **the atlas gate proves a citation RESOLVES and can say nothing about whether a
mark is still TRUE** — so a node closed by a commit that did not re-mark it stays ❌ for ever, and
nothing fails. It had happened four times before anyone noticed, twice with the DIFF prose updated
and the row above it left behind. Re-mark in the commit that closes the node, and RECOUNT the
tally rather than adjusting it: both had drifted.
§9.13-CREDIT row 5: **a second representation with nowhere to be stored is not a second opinion, it
is silence.** `ItemizedHolding.faceLocal` was written by three books, had no lane in the columnar
store, and was dropped at every week's materialisation — so every reader fell back to the value and
the model looked consistent because the disagreeing number could not survive long enough to
disagree. A field the store cannot carry is worse than no field: it makes writers believe they said
something. Before introducing a quantity beside a value, check the store has a lane for it, and
check every writer maintains it WHILE THE TWO ARE STILL EQUAL — that is the only window in which
getting it wrong cannot break anything.

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
| The insurance market (§9.16b) — `INS_TRACE=1` | Two things 16b asked to see and rule 11 forbids running for: each region's insurers' COVER shares move week to week (a share that never moves is a market that is not one), and an insurer whose surplus is gone loses book before it loses its licence (its cover share falls below its surplus share, toward zero, as its renewals go elsewhere). The trace prints each insurer's cover share and its weekly move, its surplus share, its quote in bp, and the cover nobody could write. Measure; do not tune the quote. |
| Banks paying depositors above policy | The mechanism (`evolveBankingSector`) pays up to the cheaper of the bank's own wholesale cost (`policy + its cleared spread`) and the money fund's yield, on the contested share of its base, and sets it before the fund re-quotes and the central bank moves. Above policy is a stressed bank buying funding, not a defect: count the banks and the weeks (§9.27-iii-b took the line out of the audit); never band it. |
| The two credit-ETF dust singles | 0.01B, standing since well before the wires campaign. Likeliest an in-kind slice edge, or pending-settlement timing at a boundary. May already be closed by the wires and no-caps work — re-measure before treating it as open. |

| The clearing house's refusals (§9.17-v-i) — `Region.ccpRefusedNotionalLocal`, printed by `DRV_TRACE=1` (§9.17-v-ii) | What the four markets struck beyond what their members could margin, cut at the house. Non-zero is a market sizing its demand to the wrong constraint (17-v-iii); a member cut every week is one living at its limit. Measure; do not raise the limit. |

## 8. THE APPENDICES — the two records that are not the plan

The 2026-09-02 sweep, as the reviewers wrote it: 1,771 lines of findings by area (A1–A11), with
its own step→area index. It was a RECORD and not a work list — §3 cites none of its rows — so it
lives in its own dated file and the plan keeps one live list.

**It was never re-verified**, its line numbers are from 2026-09-02, and at least one of its rows
was measured wrong. Treat a row there as a lead with a file:line, not a fact.

`docs/LOG_ARCHIVE.md` is the second: the long-form record §9's ledger lines were compressed from,
kept for the few entries whose reasoning a line cannot carry. Neither file governs.

## 9. THE LOG — WHAT IS DONE

A finished step leaves §3 and lands here as ONE ENTRY, newest first (rule 16 says how long): what
changed, why, and the measured numbers. The long-form record it was compressed from is `docs/LOG_ARCHIVE.md` — reasoning, not
governance. Violation counts are 4 weeks / `SHOCKS=0` unless the line says otherwise, and after
rule 11 they are step 38's to move, not a step's.

**13-INV-i — THE WRITE FENCE ACTUALLY FENCES, AND WHAT IT FOUND WHEN IT DID.** `check-hygiene.sh`
  names the goods boundary — *a firm's finished stock is written by the ledger only* — and matched
  the literal field name and nothing else, so three write forms walked through it: an ALIAS write
  (`row.valueLocal = x`, which is how four of the ledger's own five writers mutate), an
  OPTIONAL-CHAINED write, and a `!`-asserted index write. Three arms now — the field in every
  chained form, a stock row's two columns through any alias, and the CONSTRUCTION of a row literal
  (stopping at `;`, so a type annotation is not a write) — and each is PROVED by probe: five
  violating forms introduced one at a time, five caught, the tree clean after. The four writers
  left are named with their reasons rather than matched by accident: the merge onto the firm, the
  seam's own copy (`front-core`, whose whole record materialisation under the alias `outRec` had
  never been inside the fence at all — 13-INV-ii takes that write away), the clearing store's
  itemized holding (a HOLDINGS row, not goods), and the seed's openers.
  **What the arm found on its first run:** `domain/company-week/inventory.ts` held a second
  `chargeCarryingCost` and a second `consumeLotsFifo` — one week's warehouse charge and the input
  drawdown — and **neither was reachable from any week** (the live pair is `front-core.ts`'s own
  lane, mirrored in `native/kernels.c`, and `lots.ts:consumeFifoOnViews` over the register's lot
  columns). Two representations of each rule with one of them dead (rule 4), and
  `test/inventory.test.ts` pinned the dead pair — eight assertions that could stay green while the
  code that runs went untested, which is the §5 lesson about a test that measures nothing. Deleted;
  the file keeps `fulfillmentRatio`, and the live lane's own tests in the same file already
  covered FIFO order, per-lot cost, the partial split and exhaustion.
  **And a demonstration of PART VIII's `13-ATLAS-GATE`, unlooked for:** `firm-fundamentals.md` B2
  cited `inventory.ts:consumeLotsFifo`, and after the function was deleted `check-atlas.sh` STAYED
  GREEN — because the entry's own prose names the function it deleted, and the gate's test is
  `grep -q "\bSYM\b"` against the whole file, which a comment satisfies. That is the step's claim
  ("a citation must resolve to a SYMBOL, not to a mention") observed rather than argued. B2 is
  repointed at the live owner, `lots.ts:consumeFifoOnViews`, and goods B1.b cites the measure the
  module has left. Gates green; no run (rule 11).

**13-BOOK g-ii-d — THE FIELD GOES, AND 13-BOOK IS DONE.** `Company.plant` is deleted. Every
  writer reads its firm's rows (`plantVintagesOf`), applies the vintage function it always did,
  and writes the rows back — the scrap and the rebuild in stage 08, the estate's wear, abandonment
  and sale, the spin-off, the merger, the resolution — so there is one register of plant and
  nothing for `O16` to compare; it and `plantVintageGapLocal` are deleted with the field. A
  generator's opening vintages wait in a stash keyed by the firm (`plant-ledger.ts:stashSeedPlant`
  / `seedPlantOf`, the seed's idiom) until `openSeededBooks` or the birth writes the rows: the
  seed's firms, their clones (the parent's stash, scaled with the clone), the carriers, the
  private tier, a newborn's carve-out and the FDI subsidiary's minting; the seed's own reads
  before the rows open — the regional capital charge, the provisional freight book — read the
  stash. The harness reads the rows. **13-BOOK is through**: its §3 block leaves with this entry
  (the survey's state, the seven stores, the wall, the slices' order — all in §9's d0–g entries),
  and the one thing in it still open, the Nelson-Siegel continuous-versus-discrete convention at
  four sites, is inserted as `13-NS` where it belongs, with step 13's other leftover-free
  remainder: inventory at cost versus price is the next class. Gates green; no run (rule 11).

**13-BOOK g-ii-c — THE READERS TAKE THE ROWS.** Every read of a firm's plant is a read of its
  register rows now: the front seam's opening net and year's charge, the back lanes, the staffing
  ceiling, the unit's capital charge and the line's effective capacity in the goods auction, the
  labour stage, the equity valuation's book equity and net investment rate (the equity book, the
  stock-loan book, the CDS book, the board's buyback and the sponsor's tender), the financing
  decision, the insurers' insurable base, the carriers' fleet in the freight book and the lane
  helper, the estate's net plant, the news materiality, the burn-in probe, W6's snapshot and the
  firm's statement. The five domain reads that took a company take the vintage list
  (`fullStaffingCapHeads`, `corporateInsurableBaseLocal`, `weeklyCapitalChargeLocal`,
  `companyNetInvestmentRate`, `companyBookEquityLocal`, and `companyFairValuePerShare` with them);
  the freight book takes a `plantOf` read, because the seed prices its provisional carriers
  before any row exists. What still reads the field is the writers' own inputs (a scrap slices
  the list it is handed) — g-ii-d's. Gates green; no run (rule 11).

**13-BOOK g-ii-b — THE WRITERS KEEP THE ROWS.** Every writer of `Company.plant` hands
  `writePlantRows` the list it just computed, in the same breath: the rebuild's commissioning
  and wear-out and the scrap (`stage08-back.ts`, which now takes the world it already had), the
  estate's wear, abandonment and sale, the spin-off's two registers, the merger's and the
  resolution's acquirer and the emptied target, a birth's carve-out, the FDI subsidiary's minted
  plant — and the seed opens every firm's rows from the vintages it built (an opening stock, no
  wire). `O16` (`plantVintageGapLocal`, pure and pinned) names a firm whose rows and field
  disagree by more than dust, which is the check g-ii-c and g-ii-d stand on. Atlas:
  capital-programme A1 cites the writer. Gates green; no run (rule 11).

**13-BOOK g-ii-a — THE PLANT ROWS EXIST.** A firm's plant can be rows on its own register book:
  `PLANT` joins the one kind list (class `PLANT`, counted in `COST` — a register kept in cost is a
  register nobody can re-mark, and what a later buyer paid for a vintage is on its wire, where W6
  reads it), one row per capital good AND life (`plantInstrumentId`, because a vintage's life is
  stamped when it enters service and is not always the kind's), its lots the vintages: the cost
  each entered service at, at its own service week, price 1. `plant-ledger.ts:writePlantRows` is
  the one writer — it relinks the firm's plant rows to exactly a vintage list and touches no other
  row on the book — and `plantVintagesOf` reads them back as the list `domain/plant.ts` computes
  on. Pinned in `test/plant-register.test.ts`: the seed's age structure, two commissionings folding
  into one lot, a scrap, a spin-off's slice onto another firm's rows with the service weeks kept,
  a merger, and the fully worn leaving all round-trip exactly, beside a good's row that never
  moves. The estate's exhaustive switch states that a firm's plant is not a claim on it. No
  writer hands it a list yet — g-ii-b — so nothing in a run changes. Gates green; no run
  (rule 11). Split (rule 1.10): g-ii-b the writers, g-ii-c the readers, g-ii-d the field goes.

**13-BOOK g-i — THE DWELLINGS ARE ON THE REGISTER.** The household sector's dwellings were a
  field (`HousingMarket.ownerOccupiedUnits`, §9.26b-i) beside a wire; they are a row of kind
  `DWELLING` on the sector's own register book now — `InstrumentKind` gains `DWELLING` (class
  `HOUSING`, counted in `DWELLINGS`), the wire kind `HOUSE` is renamed to it at the same id, and
  the wire world resolves a region's dwellings by location as it did. `dwelling-ledger.ts:
  moveDwellings` is the wire AND the row in one operation: a builder or a pool creates a dwelling
  (an issue — it keeps no row of houses), a household selling out of the sector retires it off the
  row, a sale inside the sector transfers it; the seed places the opening share of households on
  the row through the region's construction pool at the seed's price, so the stock carries a
  basis from week zero (`openingDwellingUnitsOf`, and the household size has one owner). The
  units are one read, `dwellingUnitsOf`; the ownership rate, the stock's value, the housing
  book's offers, the bank pass's severity, the household sheet, the dashboard and W7's snapshot
  all read it; the estate's exhaustive switch states a dwelling is not a claim on a company.
  Pinned in `test/housing.test.ts` (the lot at the price bought, FIFO out of the sector). Atlas:
  housing A1/A1.a cite the row, the register's A1.a records the first non-financial row. Gates
  green; no run (rule 11). Split (rule 1.10): g-ii, plant, stays in §3 with its own shape.

**13-READ D13 — THE FUNDING SPLIT IS APPLIED ONCE, AT THE END, AND THE END ALREADY EXISTED.** The
  seed's step order, read whole (rule 19): the three house-bank passes each re-ran
  `applyBankFundingSplit` on every bank — a provisional household deposit line struck as the
  funding residual — and so did the household debt migration; the only readers of that stash are
  the two debt migrations, which run BEFORE the first pass, and `closeSeedMoney` (§5-CLOSE) strikes
  the line from scratch off every real deposit line at the end and opens the sector's row itself
  ("the seed's provisional sizing was a stash, retired here"). So the four applications after the
  migrations were dead writes and "one pass at the end" was the close, already. The four calls and
  the function are deleted (-43 code lines); the passes still assign house banks as parties come to
  exist, which is the reordering the survey mistook for a collapse. The-seed C1 (`closeSeedMoney`)
  is the row that names the one derivation. Gates green; no run (rule 11).

**13 C2.a — HOUSEHOLDS BID.** The largest holder class in the model held a register book per
  region (13-EQUITY) and could only ever sell it. Now the equity slice of the week's saving splits
  between the broad fund and the sector's own book by the mix it already holds
  (`domain/household-equity.ts:directShareOfEquitySaving` — a read of the register and the fund
  shares, not a stated share, so a sector holding nothing directly stays the 100% indexer the
  coverage rule makes it); `etf-flows` announces the direct slice (`pendingDirectEquityPurchaseLocal`,
  the sale's other half) and the next 07e session bids it as an indexer — no reservation
  (`indexFundDemand`), the budget across the region's float by value at the reference price
  (`householdDirectPurchaseShares`), bounded by the deposits above the buffer floor the saving
  decision keeps (`householdDirectBudgetLocal`; the floor has one owner now,
  `household-cohorts.ts:householdBufferFloorLocal`). Every held name posts a schedule that at least
  holds it, because the engine sells a prior holding with no schedule; the fills move by
  `transferHolding` against the house in both directions and the cash leg settles on the HOUSEHOLD
  party. **Found on the way (rule 12): the sale channel had never fired** — `evolution.ts` rebuilds
  `householdState` from a fixed field list (§7.41's trap) and `pendingDirectEquitySaleLocal` was not
  on it, so every announcement was dropped at the next week's 02 before 07e read it; both
  announcements are carried now. Pinned in `test/household-equity.test.ts`; atlas equity C2.a ✅,
  households D5 cites the split. Gates green; no run (rule 11).

**28b-i — THE REGION'S RATES AND FLOWS NAME THEIR PERIOD AND THEIR MONEY.** Fifteen `Region`
  fields renamed at the source to say what their writers confirm — `policyRateAnnual`,
  `neutralRateAnnual`, `taylorTargetRateAnnual`, `inflationAnnual`, `coreInflationAnnual`,
  `expectedInflationAnnual`, `targetInflationAnnual`, `gdpGrowthAnnual`, `potentialGdpGrowthAnnual`,
  `wageGrowthAnnual` (and `HouseholdState`'s), `govEmploymentGrowthWeekly`,
  `centralBankBalanceSheetLocal` — and the trade position, which the walk found stored in **USD
  under a `…Local` name**: stage 05 converts every cross-border lot at the cleared rate before the
  bilateral table sums a world total and stage 11 converts back, so `exportsAnnualUSD`,
  `importsAnnualUSD`, `tradeBalanceAnnualUSD` and `ctx.bilateralTradeWeeklyUSD` now say so, and the
  macro dashboard and the national-accounts statement, which printed the dollar figure as local
  money and divided it by a local GDP, convert at the region's own rate. The period arithmetic has
  one owner, `domain/units.ts` (out of UNMAPPED): `WEEKS_PER_YEAR` (the UI calendar's and the
  weather's own 52s read it), `runRateAnnual` / `weeklyOfAnnual` (×52 linear — the model's one
  annualisation, for flows and for rates of change alike), `trailingYear` / `yearAgoLevel` /
  `yearOverYear` (53 levels, index 0 exactly a year back; the CPI, core CPI and GDP windows read
  it) and `realGrowthAnnual`, the ratio of the gross rates over the same year: `nominal − inflation`
  was the model's real growth and overstates it by six basis points at 5% and 2% — a derivation
  change, step 38's to measure. Pinned in `test/units.test.ts`. Atlas: central-bank A3/B2 cite the
  new names, goods G2/G3 cite the owner. Gates green; no run (rule 11). Split (rule 1.10): 28b-ii
  the histories' lag at the type, 28b-iii the company's, bank's and household's fields.

**29-iv-d — THE DEFENSIVE READS IN THE UI AND THE HARNESS, AND STEP 29 IS DONE.** Three hundred
  and twenty-five, rewritten by position in two passes after the review the group needed: the
  function table the command bar indexes by a typed name is `Partial<Record>` (a name may be
  nobody's), a screener's `cols[1]?.key` is `cols.at(1)?.key` (the second column may not exist,
  and a dropped guard there would have thrown), an industry typed by a cast asks `Object.hasOwn`
  first; the rest — the total region store behind every `world.state.regions[r]?.`, the
  non-optional histories, estates, offerings and holdings behind `?? []` — lost guards that could
  not fire. The backlog `no-unnecessary-condition` found when §9.29-ii turned it on stands at
  ZERO: 331 dead conditions and 1,234 defensive reads, paid by deleting what the types excluded
  and by making sixteen sparse stores say they are sparse. The rule is an ERROR now, the gate is
  `--max-warnings 0` again (§4), and every one of §3.29's four items is closed: the greps see what
  they claim to, the two paid-for rules run, and nothing in the tree says a type is lying. Gates
  green; no run (rule 11).

**29-iv-c — THE DEFENSIVE READS IN THE SIMULATION.** Three hundred and seventy-nine across the
  stages, rewritten by position in three passes (a dropped `?.` exposes the `??` behind it). The
  index reads reviewed first: the labour market's `unmatched`/`unfilled` per occupation were
  `{} as Record<OccupationType, number>` — a cast that made a sparse accumulator total — and are
  `Partial<Record>` now, so their `?? 0` stay; the goods auction's anchor price per region, the
  declined-origination tally, the wealth tiers, the occupation pools, the swap tenor fields and
  the covenant ceilings are total, and `?? T.priceLocal[r]`, `?? 0.045`, `?? 4.0`, `?? 1.0`,
  `?? reg.policyRate` on them were fallbacks that could never run. The seed's baseline
  occupation share went with its last reader. 704 → 325: what stands is the UI and the harness.
  Gates green; no run (rule 11).

**29-iv-b — THE DEFENSIVE READS IN THE ENGINE OUTSIDE THE SIMULATION.** Two hundred and
  thirty-two, in the audit, the macro walk, the cohorts, the seed and the ledgers, rewritten by
  position from the type checker's own report: a `??` whose left side is proven non-nullish keeps
  its left side, a `?.` on a proven value becomes `.`. Reviewed first for the index reads, where a
  guard can be right and the type wrong: the wire summary's `byKind` and `valueUSDByKind` are
  sparse (a kind nobody wired has no entry) and are `Partial<Record>` now, so W1–W5's `?? 0` on
  them stay; every other indexed table — ratings, sectors, occupations, wealth tiers, regions,
  the seed's spread table — is total, and the defaults its reads carried (`?? 0.045`, `?? 150`,
  `?? 4.0`, `?? 0.25`) were stated numbers nobody owned that could never run. Three
  seed-constructor fallbacks in the macro walk (`?? createHousingMarket()` and kin) went with
  their imports; a producing-sector lookup typed by a cast asks `Object.hasOwn` first. 936 → 704.
  Gates green; no run (rule 11).

**29-iv-a — THE DEFENSIVE READS IN DOMAIN, ENGINE2 AND TEST.** Sixty-one `??` and `?.` on values
  that cannot be nullish. Most were `?? 0` on a number the sheet always carries — the bank's repo
  and RRP lines, the central bank's loans, claims and facility, a tranche's coupon and principal,
  a holding's value, a firm's headcount — and each fallback was a stated number nobody owned that
  could never run (rule 2): deleted. `FIXED_SHARE_BY_RATING[rating] ?? 0.5` and
  `HOME_BIAS[type] ?? 1` indexed total tables; `LANE_DISTANCE_NM[from]?.[to] ?? 0` a total matrix;
  `process.versions?.node` and `err?.message ?? err` types that are never absent. A CDS tenor
  typed as a string is `Object.hasOwn` before it indexes. The one sparse thing among them — the
  front table's output record per sub-unit — is `Partial`, with the column it lands in. 997 → 936.
  Gates green; no run (rule 11).

**29-iii-d — THE DEAD CONDITIONS IN THE UI AND THE HARNESS, AND 29-iii IS DONE.** Ninety-one.
  The harness: `(s.institutionalEntities || [])` five times, the region and household guards, a
  `[0]` that is `.at(0)`, a boolean hashed through a cast the `typeof` had already earned. The UI:
  every panel's `frame` was `stack[stack.length - 1]` typed as always there, so twenty `frame ?`
  branches read as dead — it is `stack.at(-1)` and they are right; the statements' `latest`/`prior`
  the same; the region objects' `filter(!!obj)` on a total store, the `parse` guards that cast a
  typed-in word to a `RegionId` before testing it (now `Object.hasOwn`), `r.weather &&`,
  `r.sovereignCurve &&`, an index page's `!raw`. Sparse stores fixed at the declaration:
  `Company.outputInventoryBySubUnit` (only what the firm has produced), the FX pairs' illiquidity,
  the occupation pools' UI read, and the per-tenor and per-line records the pages index. 1,139 →
  997, and the 331 dead conditions are gone from every directory: what stands is 29-iv's 997
  defensive reads. Gates green; no run (rule 11).

**29-iii-c-ii — THE SIMULATION'S SPARSE STORES SAY SO.** Thirty-eight guards on reads the types
  said could not miss, and every one was a store declared total that is sparse by nature. Fixed at
  the declaration, once each: `ctx.companyUpdates` (a company is touched this week or it is not —
  the six `if (!u) u = {}` openings are `??=` now), `Region.categoryDemand` (a region carries a
  category or it does not — the plan for one it does not is a `defect`), the freight rate and
  capacity by lane and the carriers' marginal rates (a lane nobody quoted has no rate), the
  lending book's fee by instrument, the desk-book kind table, the settlement's running net per
  party, the sourcing intent's need and supply per region, and the memo arrays in
  `holdings-view.ts` and `shared-helpers.ts`. The swap tenor's curve field is an `Object.hasOwn`
  lookup; a holding row's region is read as the string it is and cast where a `RegionId` is
  needed. Making the stores honest turned a hundred and fifty `?.` and `??` reads on them from
  "unnecessary" into right: 1,300 → 1,139, and 29-iv's list shrank with it. Gates green; no run
  (rule 11).

**29-iii-c-i — THE SIMULATION'S DEAD GUARDS ON TOTAL STORES.** One hundred and thirteen, in one
  shape: `if (!reg) return` on `ctx.updatedRegions[r]` and its `reg?.` cousins across thirty
  stages, `(reg.smePools || [])` twenty-two times, `(sheet.businessLoans || [])` and its household
  twin fourteen times, `(c.debtTranches || [])`, `reg.historicalZeroCurves || []`, the
  `householdState`, `wealthDistribution`, `housingMarket` and `occupationPools` guards on fields
  the region always has, `ctx.paymentJournal &&` where the journal is always there, and the
  `borrowerKind === 'SME_POOL'` tests on a loan whose only kind that is. Deleted, with the `?.`
  they carried. Two closure-set flags (`touched`, `delivered`) that narrowing could not see set
  read as always false: one became a compare-by-identity, the other says `as boolean`. The
  commodity linkage table is `Partial<Record>` — a commodity with no link has no row. 1,425 →
  1,300. Gates green; no run (rule 11).

**29-iii-b — THE DEAD CONDITIONS IN THE ENGINE OUTSIDE THE SIMULATION.** Sixty-nine. The largest
  family was `if (!reg) return` on `state.regions[r]` and its `reg?.zeroRates` cousins — twenty
  guards on a store that is total over the four regions with non-optional curves, in the audit,
  the seed's close, the ledger, the indices and the cohorts: deleted, with the `?.` they carried.
  `x || []` and `x || {}` on non-optional arrays and maps (bank transfers, the banking sector's
  books, the region's histories and lag buffers, the SME pools) and `region.householdState || {…}`
  with a thirty-line default that could never run: deleted. An `else if` that named the last
  member of an exhausted union (`sector === 'Consumer'`, `tier === 'SUBPRIME'`, the security
  loan's lender): the condition deleted, the branch kept. Types that lied, fixed at the
  declaration: the wire journal's `goodsFlows`/`plantFlows` and the summary's two views of them
  are `Partial<Record>` (a key flows the first time it is touched), as are the holdings table's
  two memos, P5's tranche memo and the seed's category groups; `array[i]` reads use `.at(i)`; the
  industry-or-sub-unit lookup asks `Object.hasOwn` instead of casting. 1,531 → 1,425. Gates
  green; no run (rule 11).

**29-iii-a — THE DEAD CONDITIONS IN DOMAIN, ENGINE2 AND TEST.** Twenty-six, and they sorted
  cleanly into the two kinds. Guards the type already excludes, deleted: `if (!inv)` on a
  non-optional inventory (twice), `x || {}` and `x || []` on non-optional fields (six in
  `stage08-back.ts`/`front-core.ts`), a test's `q &&` on a value that is never null, a `<= 1` on
  the literal 1 (the pin is now `equal`). Types that lied, fixed at the declaration: three sparse
  stores declared total — `SUBUNIT_PHYSICAL`, `CATEGORY_INPUT_REQUIREMENTS` and the contract
  table's per-region heads — are `Partial<Record<…>>` now, so every read of them says the key can
  be missing and the guards that caught it are true to the type; `array[i]` reads that can run
  off the end read `.at(i)`, which is `T | undefined`; a currency looked up by a string is
  `Object.hasOwn` first. `Region.categoryDemand` is the one declared-total sparse store left, and
  its two reads here say so at the site (`as … | undefined`) while 29-iv owns the type. A
  `const x: T | undefined = record[k]` annotation does NOT count — assignment narrows it back to
  `T`, and the rule sees through it; the store's type is the only honest place. 1,565 → 1,531.
  Gates green; no run (rule 11).

**29-ii — THE TWO PAID-FOR LINT RULES ARE ON, AND THEIR BACKLOG IS A RATCHET.** `eslint.config.js`
  named `no-floating-promises` and `no-unnecessary-condition` as the rules this project paid for and
  configured neither: no `parserOptions.project`, so neither could run. `projectService` is on
  (the gate takes 25–35 s where it took 12). Floating promises are an ERROR: the 296 the rule found
  were every node:test `test()` call, the runner's own promise, declared a known-safe call rather
  than `void`ed 296 times — zero remain. Unnecessary conditions are a WARNING under the gate's
  `--max-warnings`, struck at the honest count: 1,565 across 171 files (688 `??` whose left side
  cannot be nullish, 535 `?.` on a value that cannot be, 173 always-truthy, 126 always-falsy, 32
  comparisons of types with no overlap); §4 and `package.json` carry the number, it may only fall,
  and 29-iii/iv pay it. Gates green; no run (rule 11).

**29-i — THE THREE HYGIENE GREPS SEE WHAT THEY CLAIM TO.** `check-hygiene.sh`'s fraction ratchet
  dropped every line containing `toFixed(` — the tree's commonest idiom — so a fraction beside a
  print was never counted; it now strips the `.toFixed(n)`/`.toPrecision(n)` call and keeps the
  line: 1,263 counted → 1,291 honest, the budget struck there (from 1,377). The asset-switch pattern
  matched only a literal on the RIGHT of `===`, so `'EQUITY' === x` and `[...].includes(x)` lowered
  the count without removing a switch; it matches both sides and the list idiom now (no such site
  existed; the honest count is 44, the budget was 49). The test-purity grep said "over domain/" and
  enforced only "no `advanceWeeklyStep`/`createInitialGameState`" — ten tests build a world by hand
  (`ensureV2` on a fixture, 87 uses) and exercise the ledgers on it, which IS a pure function over
  its inputs; the rule now says what it enforces — nothing steps a week, seeds a world or runs a
  stage — and catches `run*Stage(` as well. 29-ii/iii/iv (the lint rules) are written from the
  measurement: 1,565 unnecessary conditions, 296 floating promises all in node:test. Gates green;
  no run (rule 11).

**28 — THE HARNESS'S OWN DEFECTS.** Six named; two were already gone. The capital and NIM bands
  read each region's book-weighted aggregate, so a minority of banks below the floor could never
  report — they iterate the named banks' own sheets now. The central-bank identity that was
  computed and `void`ed (the audit's M1 owns it) is deleted, not voided. NaN purity covered twelve
  fields on the objects and none of the stores: it now walks every holding row of every company,
  institution and household book (`units`, `qtyLocal`, `lienUnits`, `accruedLocal`), every cleared
  price, every account row's balance and lien, and every derivative contract's notional, strike,
  units, margin and mark — a NaN passes every `>` test silently, which is how the per-bank identity
  passed every bank every week. A firm born mid-run has a revenue baseline (its first week), so the
  ×20 check sees it. The zero-outstanding skip died with the harness's private ownership walk
  (§9.13-READ A9: the check is the audit's O1, which fires on paper held against nothing), and the
  `grossPPE/12` depreciation died with the plant register (§9.26-f-i: the harness reads
  `plantDepreciationAnnualLocal`). Gates green; no run (rule 11).

**27-iv — THE BASIS IS ARBITRAGED AT EVERY TENOR THE PROTECTION BOOK PRINTS.** `readCdsBasis` read
  the CDS–cash basis at the benchmark tenor only; the 1y/3y/10y books opened at the issuer's cash
  spread at that tenor and then moved on their own supply and demand with nothing tying them to the
  bond there. It now reads every tenor with a print against the rung nearest it — its own
  instrument, margin, weekly move and standing cover per tenor, the cash leg merged where two
  tenors share a rung (`mergeLegs`) — and records each tenor's cheapest carry
  (`Region.cdsBasisCarryBpsByIssuer`, keyed by tenor). The protection book stamps the week each
  tenor struck (`Company.cdsClearedWeekByTenor`, replacing the benchmark-only `cdsClearedWeek`),
  and P2 holds every struck tenor's basis to its carry — one finding per name and tenor. Gates
  green; no run (rule 11).

**27-iii-c-ii — X2 READS THE WEDGE THE SOURCING INTENT SAW.** X2 compared four landed prices with
  no lane between them, forgave 2.5× and fired only past a 25% quota. The wedge is the sourcing
  intent's own number: for every buyer and good it prices each origin's landed cost (ex-works in
  the buyer's money, the lane's cleared freight per unit, the pipeline's carry over the transit),
  takes the cheapest first, and now records on the buyer's `CategoryDemandState` the cheapest
  ALTERNATIVE that still had stock once its need was met (`cheapestAlternativeLandedLocal`, with
  the origin and the week; none when no other origin had stock). X2 holds the landed price paid
  (`unitPriceLocal`) to it: a buyer that paid above a route with stock is a finding, one per buyer
  and good, dust the only band. the-audit B4 ⚠️→✅ — the prices family measures what it claims.
  Gates green; no run (rule 11).

**27-iii-c-i — X2 READS THE TWO CARRIES.** The 3m future was held to a `0.8/1.25` box of spot with
  no rate, storage cost or tenor in it, and the bond future to 2 points of the cash price. X2 now
  holds every commodity contract (1m/3m/6m) to the desks' own ceiling — `costOfCarryPrice` at the
  USA short rate and the category's storage, the bound `commodity-future.ts` brings supply against —
  from above only (nobody shorts the physical, so a backwardation is the curve's to print), and the
  bond future's basis to the relative-value book's own bound: `readBondBasis` records the cheapest
  carry any fund faced each way (`Region.bondBasisCarryBps`; the annualisation through one owner,
  `domain/relative-value.ts:bondBasisDeviationBps`), and a wider basis is free money nobody took.
  Both count every breach. the-audit B4 stays ⚠️ for the goods wedge, c-ii. Gates green; no run
  (rule 11).

**27-iii-b — X1 READS THE CORRIDOR AND THE FLOOR IT CLAIMS.** X1 held repo to `policy ± 150bp` where
  the corridor is the two posted facilities' — the RRP window's floor, never below zero, and the
  standing facility's ceiling — which `repo-clearing.ts`, `interbank.ts`, `money-market-fund.ts` and
  `central-bank-loans.ts` each rebuilt from the spreads. One owner now, `macro/banking.ts:
  repoCorridorBps(policyRate)`, read by the four and by the check, which forgives dust. "A solvent
  bank earns a margin" said solvent as `> 0.08`; it reads `bank-pricing.ts:BANK_MIN_CAPITAL_RATIO`.
  "Deposits pay below policy" (50bp forgiven) left the audit for §6: `evolveBankingSector` pays up
  to `min(policy + the bank's own cleared spread, the money fund's yield)` on the contested share,
  and sets it at stage 02b before the fund re-quotes (387) and the central bank moves (420), so
  the line was a regularity no mechanism keeps at the hour the audit reads — a number to count,
  never an identity. money-market C3 ⚠️→✅ (`prices.ts:x1`); the-audit B4 stays ⚠️ for 27-iii-c.
  Gates green; no run (rule 11).

**27-iii-a — P1 AND P2 READ THE MECHANISMS THAT SET THEM.** P1 compared a paper coupon over POLICY
  and a facility margin over policy against a bond spread over the CURVE, so a steep curve read as a
  seniority breach; it forgave `bond × 1.05 + 25bp` and fired only past a 5% quota. Every leg is now
  a spread over the one curve — the facility's what par implies on its own terms
  (`spreadBpsFromPrice(trancheTerms(…), curve, 1)`), the paper's its own row's cleared spread
  (`rowSpreadBps`) — each read at ITS tenor against the bond curve there; paper, pari passu with
  the bond, is one value where a bond printed at its tenor (§3.25's `traded`); the only forgiveness
  is the solver's own resolution (`bond.ts:SPREAD_SOLVE_RESOLUTION_BPS`, the bracket halved sixty
  times) plus the subtraction's dust; every breach is a finding and the count its size. P2's basis
  band (`max(150bp, 75%)`, 10% quota) is the relative-value book's own carry: `readCdsBasis` records
  per name the cheapest carry any fund faced each way (`Region.cdsBasisCarryBpsByIssuer`; the rung
  through one owner, `credit-price.ts:nearestBondRowOf`), and a benchmark basis wider than it is
  free money nobody took — a finding per name. The other tenors have no arbitrageur: 27-iv,
  inserted. P2's recovery no longer tests 40% ± 20pp over five estates: `creditRecoveryRate` (moved
  beside its prior, `domain/bank-pricing.ts`) against the region's realised history unshrunk, the
  sample's own standard error the band — what fires is the prior's pull. the-audit B3 ⚠️→✅; cds
  C3.b ⚠️→✅; four trees re-cite `bank-pricing.ts:creditRecoveryRate`. Gates green; no run (rule 11).

**27-ii — THE SCOREBOARD SHOWS THE WIRES, THE TAUTOLOGY DIES, AND THE BAND'S DECLARATION WITH
  IT.** `audit/index.ts:auditSummary` iterated a hand-written `['M','O','P','X','F','N']`, so the
  W family (W1 money-wires = gross … W7 dwellings) reached the violation count and never the one
  output anyone reads; the families are now the keys of `FAMILY_WORDS`, typed over
  `AuditFinding['family']`, so a family with no word is a compile error and W has its section. O2's
  "market cap = price × shares" compared `stockPrice × issued` with `marketCapAt`, defined as
  exactly that — a read of one thing against itself, which cannot fire (A1.a's failure mode written
  out): deleted. `stated.ts:AUDIT_BOOKS_TOLERANCE`, read by nobody since 27-i, leaves the registry:
  12 → 11 stated numbers (§5-DIST-P). the-audit B7/D1 ⚠️→✅, A1.a ⚠️→✅. Gates green; no run
  (rule 11).

**27-i — EVERY AUDIT TOLERANCE IS FLOAT DUST, DERIVED FROM THE SUM PERFORMED.** Two percentage
  bands and a drawer of round numbers stood where rule 7 asks for one thing: `money.ts` M1 forgave
  `assets × 1e-4`, M5 `assets × 2e-3`, M6 `moneyBefore × 0.005`; `ownership.ts` O1/O2/O6 forgave
  2% of the issue and O5 `1.001 × principal + 1`; `accounts.ts` F1 `assets × 1e-3`, its cash line
  1%, F3 5% of exports on a two-legged identity; and the fixed thresholds `1e3`…`5e8` (M2/M3/M4/M8,
  W1–W3, P5/P8) forgave the same dollars whatever the sum. One owner now: `audit/types.ts:floatDust
  (Σ|terms|, n) = n × eps × Σ|terms|`, and `floatDustLocal` the same never below the cent
  (`LADDER_FACE_DUST_LOCAL`). Every check's bound is that function of the sum it performed, the
  COUNT read off what it added — O1's `ownershipCoverage` and O6's `add` count their terms per
  bucket and key, O2 its rows per issuer, M5 its loan rows and five deposit classes, F2 its reason
  keys, W1–W7 the journal's `byKind` — and M4's "overdrawn" is below zero by more than the dust, not
  by more than a million. P6's curve-against-tenor and X1's forward sign are dust too. the-audit
  A4/A4.a ❌→✅ (`types.ts:floatDustLocal`); the-register B2.b ❌→✅ and B2 ⚠️→✅ — the band on the
  register's defining identity is gone; `AUDIT_BOOKS_TOLERANCE` is read by nobody and 27-ii deletes
  it. Whatever now fires is a defect with a size, the run's to find. Gates green; no run (rule 11).

**26b-ii — THE HOUSE PRICE IS A BOOK.** The affordability walk priced the marginal buyer honestly
  and nobody transacted: no seller had a reservation and no offer could go unsold.
  `domain/housing-clearing.ts`: the OFFERS are the owners whose tenure ends this week (the
  register's units at the turnover the banks measure off their own vintages), each reserving at
  what it must fetch — its mortgage payoff per dwelling off the vintage cross-section the bank
  pass now publishes for next week's book (`sellerPayoffLadderOf`, `HousingMarket.
  sellerPayoffLadder`; every owner outright before the first pass, §7.4), never below the build
  cost (the construction sector's own cleared price, the floor the walk already carried) — plus
  the builders' completions at that cost; the BIDS are the wealth tiers at what each can borrow
  at the keenest quote, for the households of their own that move. `clearDwellings` is a
  uniform-price cross: the units clear where a bid meets a reservation, the price is the last
  buyer's bid that did, an offer no bid reaches does not clear (volumes collapse before prices)
  and a week in which nothing clears keeps last week's print. `evolution.ts` writes the struck
  price and the units that changed hands (`unitsClearedThisWeek`); the mortgage pass reads them
  at the price struck for the sales that discharge loans and the demand it originates, and the
  affordability gate that stood in for failed completions is gone — a buyer the book did not
  clear borrows nothing (`bank-lending.ts`, a defect if the pass runs before the book). The
  secondary market is inside the one household party, so it moves no wire and no register; a new
  dwelling's wire is 26b-i's. housing B1 ⚠️→✅, B4 ⚠️→✅, C5.a re-cited. Still one price per
  region: `A1.a`'s location is the only sub-market there is. `test/housing-clearing.test.ts`.
  Gates green; no run (rule 11).

**26b-i — DWELLINGS EXIST: THE OWNER-OCCUPIED STOCK IS UNITS WITH AN OWNER, AND A HOUSE GETS ITS
  WIRE.** (rule 10 split of "Housing clears"; 26b-ii in §3.) The stock was `population/2.5 ×
  ownershipRate × medianHomePrice`, computed identically in two places, and `HOME_OWNERSHIP_RATE`
  was written once and never again — the number of dwellings moved only with the population, and
  the houses built this week did not exist next week. `HousingMarket.ownerOccupiedUnits` is the
  register: the household sector's dwellings in units, seeded once as the seed's opening share
  of households and moved only by what changes hands. A household's purchase of a
  `residential_construction` unit at the goods auction IS a new dwelling (the pattern
  `passenger_vehicles` → `durableGoodsStockUnits` already carried): the GOOD wire is the build
  consumed on receipt, the dwelling itself a HOUSE wire from the builder to the household sector
  (`ledger/dwelling-ledger.ts:moveDwellings` — `wire.ts`'s declared, never-written kind, written
  at last; `wire-world.ts` resolves `DWELLING:<region>`), and the register moves by exactly it in
  the same loop. `domain/housing.ts`: `ownershipRateOf` and `housingStockValueLocal` are reads of
  the register (the bank pass read the household sheet's carried copy; both read the one function
  now); `evolution.ts`'s turnover supply reads the register's units. `summarizeWires` nets HOUSE
  wires per region's household sector, the audit's snapshot reads every region's units, and
  `audit/wires.ts` W7 closes the identity per region (`dwellingIdentityGaps`, pure). housing A4
  ❌→✅, A1 ❌→⚠️ and E1 ❌→⚠️ (the owner is the sector, not a named household; the rental stock
  has no dwelling behind it), A3 and D1 re-cited; 37-HOUSING's text corrected to what is left
  (foreclosure, the standard, the rental join). `test/housing.test.ts`. Gates green; no run
  (rule 11).

**26-f-iv-c — CAPACITY READS THE VINTAGES WHOSE KIND SERVES THE LINE.** A line's capacity was
  `unitsPerNetPpeDollar × net plant` of the WHOLE register, so a steel mill's heavy equipment
  merged into a software firm made software at the buyer's ratio. `plant.ts:plantEffectiveNetLocal`
  is what a register can produce for a use that needs its capital in a mix of kinds — Leontief
  over the line's industry's `capitalMix`: the net of each kind over its share, the minimum — so a
  register built in the mix (the seed's, a firm that buys by its mix) is worth its whole net, a
  vintage of a kind the line does not use produces nothing for it, and the kind in excess of the
  scarcest is idle. `05-unit-bidding.ts` reads it per line (`unitsPerNetPpeDollar` is fixed
  against it, as before). The estate's bidders pay for what the kinds on offer can produce for
  THEM: `sellPlantToBidders` probes the offered slice against the bidder's own register in its
  own mix, and the effective plant it adds per unit of book scales the bidder's reservation — a
  slice that cannot serve it draws no bid. the-capital-programme A4 ⚠️→✅ (specific in kind, and
  the wrong kind is worth its binding kind — misallocation possible and costly), A2 re-cited; A5
  stays ⚠️ honestly: value is what it can produce for capacity and for the estate's price, but
  the books never revalue a vintage and the scrap is by age, not by the kind in excess. The
  staffing ceiling (`fullStaffingCapHeads`) still reads the whole net — heads per plant, all of
  it staffed. `test/plant.test.ts` (in proportion the whole net produces; the wrong kind nothing;
  the excess idle; a use naming no capital reads the whole). Gates green; no run (rule 11).

**26-f-iv-b — THE CAPEX BASKET IS THE INDUSTRY'S, AND A CAPITAL GOOD HAS A LIFE.**
  `capexBasketWeight` — "the share of ANY buyer's capex basket", one mix for a refinery and a
  software firm alike — is gone. `IndustrySpec.capitalMix` says what each of the sixteen
  industries' plant is made of (stated the way its recipes are, rule 15), a profile firm's is its
  profile's (`PROFILE_CAPITAL_MIX`: premises and systems; a carrier's hulls), and
  `industry-registry.ts:capitalMixOf(lines, profile)` is the one accessor (by revenue share,
  normalised; `sectorCapitalMix` for the public seed whose lines are dealt after its books,
  `registryCapitalMix` before any buyer exists, `capitalMixOfFirms` for the authoritative seed's
  split of a region's investment by its firms' own capex). Stage 05 splits each buyer's capex bid
  by it and each SME pool's by its industry's; stage 03 sizes the capital-goods industries by it;
  the seed builds the register in it. A capital good carries `SubUnitSpec.usefulLifeYears` (a
  building's 40, heavy equipment's 18, automation's 12, a fleet's 10, software's 5 — the presence
  of a life is what makes a good a capital good, `isCapitalGood`), the vintage takes the good's
  own life at commissioning (`usefulLifeYearsOfGood`) and the seed's register wears each kind
  over its own; `usefulLifeYearsOf(firm)` is left to the tax schedule's class life and a
  carrier's hulls at the seed. The step's own test found a routing defect and closed it: a
  purchase's kind was the GOOD's question ("does any recipe consume this?" —
  `purchaseKindOf`), and four of the five capital goods are in somebody's recipe, so a
  manufacturer's heavy equipment, a retailer's automation and every firm's software landed as
  input LOTS that only a firm whose own recipe lists them ever drew (the dead-lot defect the
  function was written to end) and only construction ever became plant; it is the BUYER's
  question now (its own recipe consumes it → an input; a life → plant; else operating), asked
  at both landing sites. the-capital-programme C1 re-cited, A4 text; goods.md carries no capex
  row to re-mark. `test/capital-mix.test.ts`, `test/plant.test.ts` (each kind half worn over its
  own life). Gates green; no run (rule 11).

**26-f-iv-a — A VINTAGE HAS A KIND.** (rule 10 split of 26-f-iv into a/b/c; b and c in §3.)
  `PlantVintage.kind` is the CAPITAL_GOOD sub-unit the vintage was made from, and the construction
  lot carries it from landing (`ConstructionLot`: `05-unit-bidding.ts:addInputInventory` and
  `goods-arrival.ts` name the good they push) through the front seam's construction CSR
  (`ucKind`, a registry index or a defect at the seam; not shipped to the C core, which sums
  values) to commissioning, where the rebuild makes one vintage per kind that entered service
  this week (the front pass's rule, `entersServiceWeek <= nextWeek`, on the same lots). The seed
  builds the register in the mix the firm buys with (`seedPlantVintages(gross, life, week,
  CAPEX_SUPPLIER_WEIGHTS)` — one set of yearly vintages per kind), a carrier's fleet as
  `commercial_fleet`; `mergePlant` folds only equal (week, life, kind), so a slice, a merger, an
  estate's sale and a scrap keep every kind. the-capital-programme A4 re-cited to `PlantVintage`
  and stays ⚠️, honestly: the record now shows every firm's mix is the one basket (iv-b) and that
  capacity reads the whole register (iv-c). `test/plant.test.ts` (a mix seeds per kind; a slice
  keeps every kind; a kind never folds into another). Gates green; no run (rule 11).

**26-f-iii — THE PLANT WIRE, AND W6.** The wire follows the decision. `ASSET_KINDS` carries
  `PLANT` (appended last, so every earlier journal's kind ids stand): a move of plant between two
  parties is a numbered wire in units of COST — the asset `PLANT` for vintages in service,
  `PLANT_QUEUE` for capital that has arrived and is not yet plant — at the money per unit of cost
  it was struck at (`ledger/plant-ledger.ts:movePlant`, `movePlantQueue`; `wire-world.ts`
  resolves the two assets). Every move 26-f-ii made is one: the estate's sale at the cleared price
  of book, a spin-off's carve-out (after the spin-off is admitted as a party), a merger's and a
  bank resolution's transfer, and a birth's carve-out from its pool (a `SEGMENT` → firm wire, the
  same shape as its opening balance — 11e's "every birth assigns plant with no wire"). What is not
  a move is a TRANSFORMATION on the same journal per firm (`plantFlows`): commissioning and
  wear-out at the rebuild, the scrap in `applyCapCompWrites`, a workout's abandonment and the dead
  firm's weekly wear (the estate stage retires it — no rebuild does), a capital good's landing
  (`05-unit-bidding.ts`, `goods-arrival.ts`), and an FDI subsidiary's MINTED opening plant
  (`bornPlant`: no party held it, so the minting is recorded and stays visible — a greenfield build
  should buy its plant, 20d-iv's shape). `summarizeWires` nets the wires per firm
  (`plantNetCostByCompany`, `queueNetCostByCompany`) and carries the flows; the audit's snapshot
  reads every firm's gross plant and queue in cost (`plantCostByCompany`, `queueCostByCompany`);
  `audit/wires.ts` W6 closes both lines per firm every week (`plantIdentityGaps`, pure):
  Δ(gross plant) = commissioned − retired − scrapped − abandoned + born + wires in − wires out, and
  Δ(queue) = arrived − commissioned + queue wires, at W4's dust rule. A firm that dies this week
  keeps the capital that landed this week on its queue (the rebuild's early return dropped it:
  arrived, then never existed). the-capital-programme D1/D3 re-cited; money-and-settlement W1–W6.
  `test/plant-ledger.test.ts` (the nets and the flows reach the summary; the identity closes on
  them and names the firm and the side when it does not). Gates green; no run (rule 11).

**26-f-ii — PLANT IS DATED VINTAGES, AND THE SHEET READS THEM.** The decision 26-f asked for.
  `Company.plant: PlantVintage[]` (`domain/plant.ts`): one vintage per commissioning — what it
  cost, the week it entered service, its own life (`usefulLifeYearsOf` at commissioning: a ship's
  25 years, a fab's 7) — wearing straight-line from its own service week and LEAVING the register
  when fully worn, so the charge stops when the plant is gone (the scalar carried worn plant in
  gross for ever and charged upkeep and depreciation on it). Gross, net, accumulated depreciation
  and the year's charge are READS (`plantGrossLocal`, `plantNetLocal`,
  `plantAccumulatedDepreciationLocal`, `plantDepreciationAnnualLocal`) at the week asked;
  `grossPPELocal` and `accumulatedDepreciationLocal` are gone from the company, the row store
  (`company-store.ts`), the back lanes (`ppeDefaultLocal` with them) and the seam — the front
  core ships the register's charge as the `depreciationAnnual` lane (JS and C), and every reader
  (twenty-two sites: capacity, staffing, the capital charge, the insurable base, book equity, the
  net-investment rate, the estate, the freight floor, the harness, the UI) takes the week. Every
  writer is a vintage move: the rebuild retires what wore out and appends what entered service
  (`retireWornPlant`, `commissionVintage`); a scrap retires the OLDEST first (`scrapPlantShare`,
  returned by the lane-only core as a share and applied main-side); a spin-off slices every
  vintage pro rata (`slicePlant`) and its share of the construction queue with it — the
  structuredClone had given both books the whole queue, capital minted twice; a merger and a bank
  resolution concatenate (`mergePlant`), and the target's construction queue moves too (an
  acquired shell never commissioned it: capital that arrived and then never existed); the estate
  re-reads the dead firm's register weekly, its buyers take slices at the cleared price of book
  (the machines keep their age and life), and the last week abandons what no bidder took. The
  seed's `× 0.45` / `× 0.35` worn fractions and the six `?? × 0.45` fallbacks are gone: a
  stationary plant is vintages spread evenly over the life, half worn (`seedPlantVintages`, at
  `SEED_WEEK`; a birth's carve-out at its own week), and a carrier's fleet is a register at the
  hulls' own cost and life. the-capital-programme A1/A3/D1 re-cited to `plant.ts`; A4/A5 stay ⚠️
  honestly — a vintage is specific in time and in nothing else — and 26-f-iv (its KIND) is
  inserted after 26-f-iii. `test/plant.test.ts` (half worn by construction; gross = net +
  accumulated at every week; the charge stops when a vintage is worn; scrap takes the oldest;
  a slice conserves cost and age). Gates green; no run (rule 11).

**26-f-i — ONE DEPRECIATION SCHEDULE: THE P&L CHARGES WHAT THE PLANT WEARS.** (26-f's first
  slice; rule 10 split into 26-f-i/ii/iii, the other two in §3.) Depreciation was six derivations
  of one fact: the P&L charged `daShareOfRevenue: 0.05` — five percent of REVENUE, so a firm that
  doubled its plant took no extra charge against its earnings and capacity was free on the income
  statement and on the tax base built from it (the-capital-programme A3) — while the capital
  programme reduced the stock by the plant over its life; a profile firm was charged a stated
  twenty years whatever its sector; the seed struck EBIT off 5% and 4.5% of revenue and its filed
  quarters off 80% of capex; a carrier was seeded at its fleet's life and run at its sector's. One
  owner: `capital-programme.ts:annualDepreciationLocal(gross, life)`, straight-line, a year-rate,
  with `usefulLifeYearsOf(firm)` beside it (the sector life table moved there from
  `simulation/constants.ts`; a carrier's plant is its fleet, so its life is `FREIGHT_ASSET_SPEC`'s
  own — a ship's 25 years, a truck's 10). Both statement paths take `depreciationAnnualLocal`
  (`income-statement.ts`; `daShareOfRevenue`, `grossPPELocal` and `ppeDepreciationYears` gone
  from their inputs); the C front core takes the opening gross lane and charges the same
  quotient (`native/kernels.c`, rebuilt); the stock rolls forward by its 52nd; the upkeep target
  is it (`maintenanceTargetLocal` deleted — it was this number under a second name);
  `companyNetInvestmentRate` and the seed's valuation read it; the filed quarter takes the
  schedule's number or defects (the `(maintenance + growth) / 4 × 0.8` fallback gone).
  the-capital-programme A3 ⚠️→✅. `test/capital-programme.test.ts` (the charge and the reduction
  are one schedule; the life read once), `test/income-statement.test.ts` (twice the plant is twice
  the charge on the same revenue). Gates green; no run (rule 11).

**26-e-iii — THE FX PIP AND THE ETF ASSEMBLY COST ARE DESKS' WIDTHS, AND THE TABLE IS GONE.** A
  client converting currency — a firm short of a foreign money at settlement (`fx-funding.ts`), a
  cross-border invoice, a household or a treasury buying abroad (`05-unit-bidding.ts`) — paid a
  stated 2bp to its region's banks by market share. Each desk now earns ITS OWN pip on its share
  of the flow: `domain/dealer-desk.ts:fxConversionPipOf`, the desk's width on a rate of one —
  financing for the week until it squares at the FX session, at the cleared repo rate, plus the
  pair's own measured weekly move at the bank's own risk aversion; a pair that has not printed
  twice is quoted on financing alone, and a region's aggregate flow abroad on the mean move over
  its pairs. The ETF basket's assembly cost — the investor's indifference point that bounds a
  premium — is the equity desks' own width that week (07e publishes `equityDeskWidthBpsByRegion`,
  `etf-flows.ts` reads it; a week no desk quoted costs nothing beside the level).
  `DESK_SPREAD_BPS_BY_BOOK`, its `dealers.ts` re-export and its dead `commodity`/`derivatives`
  entries are deleted: no stated spread is left in the model. fx-spot B5 re-cited, C3 ⚠️→✅.
  Gates green; no run (rule 11).

**26-e-ii — THE WIDTH OF A DESK'S SCHEDULE IS WHAT CARRYING THE POSITION COSTS IT.** The table's
  second job: every desk's `fullSizeStatRange` — how far the level must move in its favour for it
  to go from flat to full — was `DESK_SPREAD_BPS_BY_BOOK`'s nine literal real-market widths.
  `domain/dealer-desk.ts:deskScheduleWidth` now: what financing the position costs the desk for
  the week until it re-quotes (the region's own cleared repo rate) plus the risk it bears over
  that week — the instrument's own measured one-week move (`prices.ts:weeklyPriceMoveOf`, nothing
  before it has printed twice) at its bank's own risk aversion (`domain/preferences.ts`) — in the
  book's own statistic (a price distance, or bps per unit of duration). `buildDealerDeskBook`
  publishes the width the desks actually posted, capacity-weighted, and the underwriting fee's
  `bookSpreadBps` (07b, 07d, 07e) reads it; the `spreadBps` argument and the five books'
  `DEALER_SPREAD_BPS` are gone. dealer-desks B3 ⚠️→✅, C3 ❌→✅, C5 ❌→⚠️ (C4's adverse selection
  still absent); the-clearing-engine E3 ❌→✅; sovereign-credit D6 ❌→✅ (tally 40/11/23);
  corporate-credit D3.c stays ⚠️ (the skew moves with inventory, the width does not).
  `test/desk-width.test.ts`. Gates green; no run (rule 11).

**26-e-i — THE FEE ON THE MID GOES.** `DESK_SPREAD_BPS_BY_BOOK`'s first job was a fee: every book
  passed its stated width as `ClearingParams.dealerSpreadBps` and the kernel charged every
  participant `|traded| × bps` beside the one cleared level — whether a desk stood between the
  parties or not — and `settleClearedBook` paid that income to the region's banks by market share,
  to desks that had taken no position (dealer-desks C5.a, B3, F3; the-clearing-engine E3's first
  half). Deleted: the parameter, the kernels' `fillFee` lane (TypeScript and C, rebuilt; the
  `uncleared` lane moves to output 9) and the three worker paths' copy of it,
  `totalDealerRevenueLocal`, the index funds' bound shaved by the fee (07b, 07d), the equity
  book's own bps on every share flow (07e, three sites), and the fee half of settlement — the
  rounding dust of the legs still lands on the region's desks pro rata, which is what dust does.
  A participant pays what it traded at the cleared level and nothing beside it; a desk earns by
  where its own schedule stood. dealer-desks C5.a ❌→✅, F3 ⚠️→✅ (a desk's P&L is its fills and
  marks, nothing times volume), B3 stays ⚠️ and C5/C3/C4 ❌ for the width, which is 26-e-ii's
  (split per rule 10: 26-e → i/ii/iii). Gates green; no run (rule 11).

**26-d — ONE COST OF CAPITAL PER FIRM.** What a firm's capital requires was stated in seven places,
  four ways: the labour stage's `10Y + β × premium × risk aversion`, the freight and commodity
  books' and the seed's `10Y + β × premium`, the estate's `10Y + premium` (one hurdle for every
  bidder, floored at 1%), a bank's own with a 1% floor, and the goods auction's seller floor at
  `(0.05 + pd × 0.60) × 1.5` — a stated hurdle, a stated loss-given-default and a stated shape.
  `domain/company-week/cost-of-capital.ts` is the one owner now: `costOfCapitalOf` (the region's
  own long rate — `riskFreeRateOf`, the policy rate before a curve exists — plus the premium on
  the firm's own beta at its own management's risk aversion; `EQUITY_RISK_PREMIUM` moved there,
  re-exported by `equity-valuation.ts`) and `weeklyCapitalChargeLocal` (its net plant at that
  rate). Every site reads it: the labour affordability test, the carrier's hull charge, the
  commodity hedger's concession, the bank's own, the seed's capital charge, each plant BIDDER
  against its own hurdle at the estate, and the seller's ask — which now carries the return its
  plant requires per unit (this line's share of the weekly charge over the week's units) where the
  stated markup stood; the fallback ask for a line with no production marks up by the same rate.
  The two 1% floors go (rule 6). goods B5 and the-capital-programme B1 diffs updated (B1 stays ❌:
  the hurdle exists, the comparison does not). `test/cost-of-capital.test.ts`. Gates green; no run
  (rule 11).

**26-c — A NAME WITH NO PROTECTION BOOK HAS NO CDS SPREAD.** `stage08-back.ts` carried a name's
  five-year cash spread as its CDS spread whenever the protection book had not printed it — the
  derivative standing in for its underlying (derivative N3), and a basis of exactly zero by
  construction for every such name; the seed opened every firm at `oas ± random` and every bank
  and carrier at its rating's table. `Company.cdsSpreadBps` is optional now: the benchmark tenor's
  last print of the name's protection book (`cds.ts`), NaN on the lane and undefined on the
  object until there is one, never derived from the cash spread. Every reader asks — the book's
  anchor (last print → the cash leg at that tenor → the structural hazard), the index
  (`cds-index.ts`), the basis trade (`relative-value.ts`), the audit's basis test, the rating
  news and the company view ("no protection has printed"). derivative.md N3 ⚠️→✅;
  corporate-credit H4's diff updated (H4 stays ⚠️ for the mirror's borrow, 17f-v). Gates green; no
  run (rule 11).

**26-b — THE CARRY IS READ, NOT CALCULATED.** `carryCalculator.ts` (138 lines, deleted) was an
  invented spread/yield world beside the cleared one: policy + 50bp "repo" for equity, + 40bp for
  bonds, + 20bp for sovereigns, a 375bp loan margin and a 150bp CDS by default, 0.8%/1.5% short
  drags, a 1.8% dividend yield when the company had none. A position's weekly carry is now a read
  (`12-portfolio:carryRead`): what its paper pays — the tranche's own coupon or rate-plus-margin
  on FACE (`trancheTerms`), a sovereign's own coupon, an equity's own dividend on value — less what
  holding it costs at the rate this world clears, the region's GC repo rate (`repoRateAnnual`, one
  owner); a short pays the borrow fee the securities-lending book struck for that name or tranche
  (`borrowFeeBpsByCompanyId`) plus the income it owes, and a short with no borrow struck is a
  defect, not a free position. `Position.expectedWeeklyCarryLocal` (declared, never written)
  deleted. Gates green; no run (rule 11).

**26-a — THE PLAYER'S MARKS ARE THE REGISTER'S PRINTS.** `12-portfolio` marked a sovereign
  position through `priceSovereignBond` — the fitted curve at the position's remaining tenor,
  never the tranche's own print — and priced un-printed corporate paper through
  `priceCorporateBond`, a round trip from a cleared spread through Nelson-Siegel. Every position
  marks at its tranche's print now (`clearedPriceOf`; a sovereign ticket names its tranche), paper
  the book has never printed keeps the mark it had, and `dv01` is the paper's own schedule at the
  print's own yield (`pricing/bond.ts:dv01PerUnitFace`); a sovereign position's terms are its own
  coupon on the sovereign's own schedule (`SOVEREIGN_PAYMENTS_PER_YEAR`, one exported owner) and a
  position with no coupon is a defect, not a 4% default. Both pricers and `calculateDiscountFactor`
  are deleted (this was their only caller). The 70/30 and 80/20 attribution fractions are a
  measurement now: a fixed bond's move is split into what its own spread change explains at this
  week's curve (`Position.markedSpreadBps` remembers the last mark's spread) and the rest, which is
  the curve's; a floater has no rate leg, so its whole move is credit. Split per rule 10: 26 is
  26-a…26-f in §3. `test/bond-dv01.test.ts`. Gates green; no run (rule 11).

**25 — A CURVE POINT SAYS WHETHER IT WAS TRADED OR INTERPOLATED.** `Region.sovereignCurve` records
  the week and the tenors the standing fit was made through (`sovereign-curve.ts` writes it beside
  the fit; the seed's has traded nothing), and `nelsonSiegel.ts:curvePointAt` hands back a point
  with its provenance — TRADED where a tranche within a week of the tenor cleared in the fit's
  week (the clock's own resolution, rule 8), INTERPOLATED between two trades, EXTRAPOLATED beyond
  them, UNTRADED on the seed's curve. A new issue's coupon (`11-fiscal`, bills and bonds) and the
  make-whole's discount rate (`stage08-back.ts`) read a point, not a number; the curve view lists
  the tenors that traded. Found on the way in and fixed: an uncleared bill deposited
  `zeroRates.tenor3M` — the previous fit's own output, at the wrong tenor — as an observed point
  (D3.a's shape inside the fit), and a bond book with nothing to trade deposited the solver's
  bracket while the price store refused it; only a trade is a point on the curve now. Both
  sessions anchor a tranche on its OWN last print (`clearedPriceOf`) and take the curve's point only
  for paper that has never traded. Still reading the fit as a bare number: the player's position
  marks (`12-portfolio`) and `pricing/bond.ts:zeroRateAt`'s linear interpolation between the five
  published points — recorded in sovereign-credit's D3 diff as leads. sovereign-credit D3.b ❌→✅.
  `test/curve-provenance.test.ts`. Gates green; no run (rule 11).

**24-ii — THE SEEKERS HAVE A RESERVATION.** A matched seeker accepts nothing below its outside
  option — the benefit this world already pays it, `UNEMPLOYMENT_REPLACEMENT_RATE` of the going
  rate (a transfer-policy primitive) — so both passes of the labour clearing refuse a bid below
  that share of the rate it is bid against: in a slack market the print falls to it and no
  further, in a tight one the bids set it. labour D1 ✅ (posted demand against posted supply, per
  occupation and region), B1 ❌→⚠️ (the acceptance is the household's; whether it searches at all,
  and for how many hours, stays 37-SMALL). `COST_OF_LIVING_PASS_THROUGH` (0.6 of inflation, times
  a bargaining power off tightness) deleted: it raised the going rate beside the bargain the model
  already has — the firms' bids carry a price rise as a nominal surplus per head, and the rent
  share of it reaches the bid at the firm's horizon — a second channel from prices to wages (rule
  4). Of the labour constants the step named, what remains — the two hiring speeds, the distress
  speed, the withdrawal rate, the two quit elasticities, the matching function's own — is
  37-EMPLOYMENT's and 37-SMALL's, where a posting and a quit get an owner. Gates green; no run
  (rule 11).

**24-i — THE MATCHES CLEAR ON THE WAGE.** One fill ratio per occupation, `min(1, hires/vacancies)`,
  applied identically to every employer — so an offer 40% over the going rate filled the same share
  as one 40% under, and the wage moved AFTER the allocation off the share it could not fill.
  `domain/labour-clearing.ts:clearLabourMatches`: every posting is a BID (the employer's openings
  in an occupation at its own `offeredWageIndex`; the segments post at the going rate), the week's
  matches go to the highest bids first, pro rata within an equal bid, and the mobility pass's
  movers clear what the first pass left in the same order; hires are what landed on a bid. The bid
  that took the last match is the occupation's print (`OccupationPool.clearedWageIndex`, on the
  occupation view). A firm the market rationed bids that price or its rent-sharing level, whichever
  is higher, a firm that filled bids the bargain's level, and either closes the gap at its own
  management's horizon (`patienceWeeksOf`) — `WAGE_PUSH_PER_UNFILLED_SHARE_ANNUAL` (0.10),
  `WAGE_PULL_PER_MARGIN_SHORTFALL_ANNUAL` (0.45) and the tightness ease deleted. The going rate is
  the employment-weighted average of what is actually paid (firms at their levels, segments and
  government at the rate), a read; `MARKET_WAGE_CATCHUP_SPEED_WEEKLY` (0.15) deleted. Split per
  rule 10: 24-ii (the seekers' reservation; COLA dies into it) inserted; D2.b, the quit elasticity
  and the withdrawal rate are 37-EMPLOYMENT's. labour A3.a re-cited, D1 ❌→⚠️, D2 ⚠️, D2.b ❌→⚠️.
  `test/labour-clearing.test.ts`. Gates green; no run (rule 11).

**23 — THE INPUT PRICE INDEX DIES INTO THE CLEARED PRICE.** Stage `04-input-output` is deleted
  whole, because every part of it was a second representation of what stage 05 clears: its demand
  was `demandLevelAnnualLocal × recipe intensity / 52` — the same Leontief intermediate demand
  stage 03 folds into the level and 05 clears as named recipe buyers' bids; its supply was the
  commodity's `weeklySupplyUnits × spotPrice` (since §9.22 a share of LAST week's cleared supply, a
  loop); its stock was a segment-pool row that 04 alone produced into, drew from and decayed
  (`setSegmentStock`/`segmentStock*`, the seed's tenth-of-demand opening stock and
  `SEED_OPENING_STOCK_SHARE`, the audit snapshot's pool term — all gone); its price index
  `newPriceIndex = 0.85 × old + 0.15 × (1 + 0.4 × (bid/available − 1))` was read by nothing but the
  market view; its fulfilment ratio was min'd into the kernel's `newInputSupplyConstraintFactor`
  beside the real FIFO draw's (both kernels, `mktFulfill` lane deleted; the factor is the draw's
  alone and is still inert — goods B1.b, 37-SMALL). `CategoryDemandState` loses
  `inputCostPressure`, `upstreamScarcityIndex`, `_fulfillmentRatio`; a category carries ONE index,
  `clearedInputPriceIndex` (05's cleared landed price against its seed), and the market view reads
  a buyer's input prices as its inputs' cleared indices weighted by its recipe. The weather yield
  loss lives in 05's pipeline alone. commodities-spot D2/D2.a/F2 re-cited (still ❌: the
  commodity's own stock is 37-COMMODITY's), E1 and the goods B1.b/G1 diffs updated. Gates green;
  no run (rule 11).

**22 — COMMODITY SPOT IS A READ OF THE GOODS AUCTION.** `evolveCommodity` multiplied last week's
  spot by `exp(0.4 × (growth + noise) + 0.12 × (clearingRatio − 1))`, reading the sub-unit's cleared
  supply and demand only as the statistic that moved a written path, with both schedules written as
  elasticities (−0.7, 0.5) on spot over the seed's history. Deleted, with
  `computeCommodityClearingRatio`. `domain/commodity-spot.ts:markCommodityToAuction` — one writer,
  stage 07 — sets spot to the linked sub-unit's world print: every origin's ex-works cleared price
  (`exWorksUnitPriceLocal`, seeded where the books open and given its first reader) in the
  numéraire, weighted by the units it supplied, times the commodity's own unit against the
  sub-unit's (`Commodity.goodsUnitsPerUnit`, rule 8: fixed once at the seed where the marginal
  producer's cost per unit meets the sub-unit's seed print, so the seed prints at its level and
  week 0 and week 1 are one shape). `weeklySupplyUnits`/`weeklyDemandUnits` are the auction's own
  units in the commodity's value share; no origin supplied → no print, the last carries (§3.21).
  The weather's yield loss, which scaled that statistic, is a loss of UNITS where they are made:
  `weather.ts:subUnitYieldLossShareOf` (the affected commodity's stated loss in its share of the
  sub-unit) comes off what the region's plants FINISHED this week (05's pipeline — goods B4 ⚠️,
  fewer units produced so W4 holds) and off 04's segment production; the auction prices the
  shortage the same week. Futures settle to a cleared print (commodity-futures D4 ✅,
  derivative-layer F4 ✅, derivative D3.a ✅); commodities-spot F3 ✅, D1 ⚠️ (one world print —
  location is 37-COMMODITY's, with the stock: `inventoryLevelPct` is still the percentage walk,
  now in `07-commodities.ts`), B1/B2/B2.a/C1/C2 ✅ as the goods side's, B1.a/E1 ⚠️.
  `test/commodity-spot.test.ts`. Gates green; no run (rule 11).

**21 — A BRACKET CAN NEVER BE A PRINT.** (21-BRACKET's measurement — 67 tight and 139 wide bracket
  prints over the 16-week reference — is closed with it.) `solveClearingStat` returned `number` and
  printed a bracket bound wherever no clearing level existed. Now the solve reports its outcome
  beside the number (`SOLVE_CLEARED` / `SOLVE_NO_DEMAND` — nobody wants any at any level — /
  `SOLVE_OVERSUBSCRIBED` — mandated cores past the float at every level; `lastSolveOutcome`, a
  module variable, no allocation in the hot loop; the C kernel mirrors it and the workers carry
  the lane), the kernel carries LAST WEEK'S statistic for an uncleared book while the allocation
  still rations the cores pro rata, and `ClearingResult` says so per instrument
  (`unclearedByIndex`, `printById: ClearedPrint`). The number-only accessors are deleted, so the
  compiler made every one of the twenty adapters say what it does: each reads its print through
  `takePrint` / `unclearedAt`, which record the book on `ctx.unclearedBooks` (kept as
  `lastWeekUnclearedBooks`, told once a week by the news). The saturation retreat stays. Test:
  cleared, no demand, oversubscribed. `the-clearing-engine.md` C4.b ✅. Gates green; no run.

**20-LLR-iv — A BANK CAN FAIL FOR LIQUIDITY.** 20-LLR is closed with this. Resolution triggered on
  capital alone (`isBankUnderPca`, a book ratio); `domain/bank-resolution.ts:isBankIlliquid` is the
  second trigger, distinct: a bank whose account at the central bank is below zero after the close's
  market and window have run — the repo books, the unsecured book on its name, the seat it was
  eligible for — cannot pay, and `bank-resolution` closes it for that whatever its capital ratio
  says; the resolution's news names which trigger fired. `money-market.md` D4 ✅,
  `banks-funding-and-liquidity.md` D6 ✅, `banks-capital-and-resolution.md` C1.a ✅ (C1's book-ratio
  test stays ⚠️, D1's). E5 — what one bank's run says about the others — noted on 37-BANKEQUITY.
  Gates green; no run.

**20-LLR-iii — THE THREE QUESTIONS, ANSWERED.** With a bank that cannot fund now having somewhere to
  be, the three constraints 20-LLR first proposed as patches are mechanisms. (1) A penalty on the
  overdraft: `central-bank-loans.ts:chargeOverdrawnReserves`, at the open — an account that ended
  the week below zero pays the window rate plus the unsecured penalty on it, from the bank's own
  account; the overdraft stands, as the negative reserve it is. (2) The seat lends only to the
  solvent: `repo-clearing.ts:windowEligibleBorrowers` — a bank under PCA borrows from the private
  lenders in the book on the same terms as anyone; the window's size is the other borrowers' need
  and its fills never reach it (Bagehot's fourth, on the one facility with the other three).
  (3) The run: `stages/depositor-flight.ts:runDepositorFlight`, first thing at the open — a bank
  that ended last week short (`bankFundingShortStreakWeeks`, the record the close keeps) loses
  its uninsured depositors, firms and institutions, to the region's soundest bank, each when the
  bank has been short for as many closes as its own management's patience; the deposit leaves
  with the reserves behind it, so the bank is shorter at the next close, and the news tells it.
  The household line, insured, stays (E4). 20-LLR is closed; a bank FAILING for liquidity is
  20-LLR-iv (inserted). Trees: `money-market.md` D5 ✅ D5.b ⚠️ D6 ✅, `the-central-bank.md` D3 ✅
  D3.a ✅, `banks-funding-and-liquidity.md` E1 ✅ E3 ✅ E3.a ⚠️ E4.a ✅, `money-and-settlement.md`
  B3.b ✅. Gates green; no run.

**20-LLR-ii — THE LOAN IS DELETED.** `strikeCentralBankLoan` — the funding close's unsecured,
  flat-priced, unrefusable loan of whatever the market left unfunded — is gone. The standing-facility
  seat in the repo book (collateralised, size-bounded by the unencumbered paper, priced at the top of
  the corridor, at the close since 20-LLR-i) is the window's only lending; the close runs the repo
  books, the unsecured book on the name and the overnight window round by round and stops when
  nothing moves (the window's draw now reports what it parked so a drained bank gets its round).
  A bank still below its buffer ends the week so: `bank-funding-close.ts:recordFundingShortfalls`
  writes each bank's shortfall on the region (`bankFundingShortfallsLocal`, empty on a clean
  close) and the news tells it. The `CB_LOAN` kind and its service stay for 20-LLR-iii. Trees:
  `money-market.md` C5 ✅ C4.b ✅ B7 ✅ (D6 ❌: the seat lacks the solvency test),
  `the-central-bank.md` D3 ⚠️ (three of Bagehot's four) D4 ✅ (D3.a ❌), `banks-funding-and-
  liquidity.md` D6.a ✅, `money-and-settlement.md` B3.b ❌ (an overdrawn bank is nobody's borrower
  until 20-LLR-iii prices it). Gates green; no run.

**20-LLR-i — THE MONEY MARKET CLEARS AT THE CLOSE.** The session (`runRegionalRepoSession`) ran at
  stage 3 of ~50, before every book that moves reserves, so it sized each bank's shortfall against
  a Monday-morning balance and the unbounded loan at the close plugged what it could not see (the
  cause 20-LLR names). Split: the OPEN keeps the maturities, the returned window cash and the
  record of what each borrower rolled (`repo-clearing.ts:openMoneyMarket`, in 02b, with
  `ctx.repoRolledByBorrower` carrying the structural need to the close); the SESSION runs inside
  `bank-funding-close.ts`, after the close has settled — per region, per round: the repo books
  (the standing facility as the posted-rate seat), then the unsecured book on the name (20b),
  then the overnight window taking what was left unlent (`drawReverseRepoAtTheClose`, moved
  inside the round from its own stage), then settlement, until nothing moves. The banks' secured
  lines are written on their live sheets from the book at the close; `reg.repoRateAnnual`,
  `repoFundableNeedLocal`, `repoClearedVolumeLocal` are the close's; the money fund's quote is
  refreshed off the post-session book. The unbounded loan still stands behind it — 20-LLR-ii.
  `money-market.md` A3 ✅ A3.a ✅, its C5/D6 table re-dated. Gates green; no run.

**20-LLR-b — THE SWAP-LINE DRAWS ARE ROWS, AND THEIR COPIES ARE READS.** The draws were a list on
  the central bank's record (`CentralBank.swapLines`) with three copies kept beside it by hand —
  each bank's `swapLineDrawnByRegion`, the central bank's `swapLineLentByRegion` and
  `swapLineDepositsLocal` — added to at the draw, subtracted at the unwind, merged at a resolution,
  compared by M2. Now a draw is a row of the contract store (kind `SWAP_LINE`: the lending central
  bank as A, the bank as B, the foreign money as the row's currency, the home region as its
  region, the lending region as where it is repaid into; the foreign principal, the home money
  given per unit of it at the draw, and the numéraire value the lender booked), read and written
  through `contract-ledger.ts:swapLineBookOf` / `publishSwapLineBook`; `stages/swap-lines.ts`
  draws, services and unwinds rows, `syncSwapLineSheets` is the one writer of the three lines
  (reads of the book, `domain/swap-lines.ts:swapLineDrawnByRegionOf` etc.), a resolution
  re-seats the rows (`reseatSwapLines`) instead of merging maps, and the news reads the book.
  The lending central bank's FX-reserve line stays its own (the FX book moves it too). Test: the
  three reads. `the-central-bank.md` A2.b and D3 notes. Gates green; no run.

**20-LLR-a — THE CENTRAL BANK'S LOANS TO ITS BANKS ARE A BOOK.** `loansToBanksLocal` was a scalar the
  funding close added to and 02b subtracted from; `centralBankLoanLocal` its mirror on each
  bank, mutated by `raiseCentralBankLoanLocal` and `repayCentralBankLoanLocal` (both deleted);
  the interest was charged on the balance at today's rate. Now each close's loan is a row of the
  contract store (`domain/central-bank-loan.ts`, kind `CB_LOAN`, the central bank as lender, the
  bank as borrower, struck at the window rate plus the penalty, overnight): the funding close
  strikes it for what the interbank market left unfunded (`stages/central-bank-loans.ts:
  strikeCentralBankLoan`, the reserves it creates paid against the row), the open services it —
  each row pays its week's interest at its own struck rate through the bank's own account,
  repays what the bank holds above its buffer oldest-first, and rolls the rest a week on at that
  morning's rate (`serviceCentralBankLoans`, before the window's other flows) — and a resolution
  re-seats the failed bank's rows on the acquirer (`reseatCentralBankLoans`). The two scalars are
  reads of the book (`syncCentralBankLoanSheets`), M2 now checks the sync, and the swap lines'
  copies are 20-LLR-b (inserted). Bagehot's four are still absent — that is 20-LLR's, which now
  has rows to write into. `the-central-bank.md` D3 and A2.b, `money-market.md` C5,
  `money-and-settlement.md` B3.b, `banks-funding-and-liquidity.md` D6.a re-cited. Gates green; no
  run.

**20d-iii — GUIDANCE IS THE MANAGEMENT'S OWN EXPECTATION, PUBLISHED.** Step 20d is closed with this
  (its six decisions, per rule 1.10: 20d-i, 20d-ii and this are §9; risk appetite already IS the management's
  `riskAversion` in every hurdle and buffer; growth-versus-margin orientation is the investment
  project's hurdle and horizon — 37-COSTOFCAPITAL, where it is noted; acquisition intent is
  the acquirer's own valuation — 37-MANDA, where it is noted; product-line entry is 20d-iv, inserted after 37-COSTOFCAPITAL because entering a line is an investment project.) `stage08-back.ts` picked one of
  three fixed prose snippets by the sign of the EPS surprise and `newsGenerator.ts` put it in the
  headline as management's guidance. Now the report (`EarningsReport`) carries the EBITDA margin
  the management delivered, the margin it guided at its last report (`Company.guidedEbitdaMargin`),
  the surprise against that guidance, and the margin it guides ahead — `expectedEbitdaLocal`, its
  own adaptive expectation of its earnings over what it sells, the number the board already judges
  it on at review — and the commentary and headline say those numbers; the three snippets are
  gone. `news-and-the-player-surface.md`'s bullet closed. Gates green; no run.

**20d-ii — A PRODUCT LINE CAN BE EXITED.** A firm's `productLines` were fixed at the seed for life:
  the plant of an idle line was mothballed after the management's horizon and scrapped after four
  (`capacityRetirement`), but the line kept its revenue share, kept posting offers at zero
  production and kept a category share. Now the goods auction records what each line MADE
  (`producedUnitsBySubUnit`, beside the sales it already recorded per sub-unit), a line that
  neither made nor sold a unit in a week is idle (`ProductLine.idleStreakWeeks`, the line's own
  clock), and `company-week/product-lines.ts:exitIdleLines` — run in stage 08's line write-back —
  exits a line whose streak reaches the plant's own scrap horizon (4 × `patienceWeeks`): its
  revenue share goes to the firm's other lines in proportion, its category share back to the
  market, and a firm whose last line goes has nothing to sell (not a death by rule; the distress
  path reaches it on its own books). Test: streaks count and reset, exit at the horizon,
  shares renormalised, the last line can go. `firm-fundamentals.md` E1 and
  `firm-birth-and-death.md` B4 re-cited. Gates green; no run.

**20d-i — THE LEVERAGE POLICY IS THE MANAGEMENT'S.** Step 20d split per rule 1.10 (see 20d-ii's
  head for where each of its six decisions went). `decideCorporateFinancing` levered every firm
  to its covenant ceiling whenever debt was cheap, at a stated 4% of the gap a week, delevered at
  6% of cash, and capped the raise at three times the larger of its growth run-rate and 2% of
  market cap. Now `corporate-financing.ts:targetLeverageOf` is the management's own target — the
  lender's covenant line (the lender's, step 34's) divided by its `riskAversion`, so the median
  runs to the line and a management twice as averse runs half of it; the pace is its own horizon
  (`1 / patienceWeeks`, replacing both rates); what new money is raised into is the firm's own
  capital programme (the week's growth and maintenance spend — a firm with no programme raises
  nothing; the ×3 and the 2%-of-market-cap floor are gone); and a management ABOVE its target
  pays down toward it whatever debt costs (`DELEVER_TO_TARGET`, stage 08 routes it with the
  expensive-debt branch). The 50bp action band stays as the one stated number in the decision.
  Test: target scales with aversion, raise = gap over horizon capped by the programme, no
  programme no raise, above target delevers over the horizon. `firm-fundamentals.md` E4
  re-cited. Gates green; no run.

**20-LLR-0 — THE RESERVES COPY IS GONE.** (user, 2026-09-05, asking whether reserves are kept the
  way other assets are: yes — a bank's reserves are one RESERVES row at the central bank, moved
  only by settlement legs, read by `bankReservesOf`, closed by M1 and M6.) The one exception was
  a report: `BankingSector.centralBankReservesLocal`, written every week as `max(0, cash)` by the
  evolution, seeded off its own GDP ratio (`centralBankReservesToGdp`, read by nothing else),
  restated by resolution and stage 11, and read only by three UI views. Deleted with its ratio;
  the views sum the banks' rows. The asset side of the central bank's sheet is NOT a book —
  inserted as 20-LLR-a, directly under the step that will delete the unbounded loan it would
  carry. `the-central-bank.md` A2.a re-cited. Gates green; no run.

**20c-ii — THE BORROWER SHOPS.** The SME pool's week of demand was split across the region's
  banks by each bank's share of the pool's EXISTING loans, so a wide quote lost no volume to a
  tight one and a bank running its book off (20c-i) handed its share to nobody. Now
  `bank-lending.ts:planSmeShopping` plans each region's week once, before the banks' own passes:
  every lending bank quotes each pool its all-in rate (its own hurdle through the one loan
  price), the pool's demand at a quote is its own hurdle test, the banks are walked keenest
  first, each taking what the pool still wants at its price up to the capital headroom it has
  left across every pool; what no headroom covers at a quote the pool wanted is the region's
  declined origination (counted once). `runBankWeeklyLending` books what came to the bank; the
  `bankShare ≈ existing share` split and its 0.25 fallback are gone. Test: keenest first, wide
  quote lost, remainder passes down, run-off quotes nothing. `banks-lending.md` C2 ✅ C2.a ✅.
  Gates green; no run.

**20c-i — A SOLVENT BANK ANSWERS ITS OWN MARGIN BY RUNNING THE BOOK OFF.** Of the three responses
  the step named, one was missing and two were not: the deposit rate already pays only the
  contested share of the bank's alternative cost (`evolveBankingSector`), and a bank has no
  operating-cost line to cut (an absence, recorded on the tree). The missing one is built:
  `banking.ts:bankRunsOffItsBook` reads the bank's own last measured `netInterestMarginPct`, and
  a bank whose book loses money originates nothing — SME (`runBankWeeklyLending`), mortgage and
  consumer (`runBankHouseholdLending`) — the declined demand counted where it always was, so the
  book amortises until the margin is back. Repricing what it writes is 37-COSTOFCAPITAL's
  cost-of-funds term and 20c-ii's shopping borrower (inserted). No measurement was taken (rule
  11 overrides the step's own parenthetical). `banks-funding-and-liquidity.md` D4 ⚠️,
  `banks-lending.md` B2.c re-cited. Gates green; no run.

**20b — THE INTERBANK UNSECURED MARKET, AT THE CLOSE.** The boundary's named successor, built:
  `stages/interbank.ts:runInterbankSession` runs inside the funding close (after the day's flows,
  before the window). Each bank below its buffer is its own YIELD_LIKE book on its NAME; every
  bank above its buffer posts a schedule starting at the front of the borrower's own cleared
  credit curve (`issuerSpreadAtOnCurve`; the posted constant for a bank nothing has priced) and
  fully committed by the top of the corridor; borrowers clear strongest name first, so a doubted
  name pays more or finds no bid, and only the unfilled remainder reaches
  `raiseCentralBankLoanLocal` (now read on settled reserves plus posted legs). The loan is a row
  of the contract store (`domain/interbank.ts`, kind `INTERBANK`; `interbankBookOf` /
  `publishInterbankBook`), principal between reserve accounts at the close, repaid at the next
  open with interest between the banks' own accounts (`matureInterbankLoans`, 02b, before the
  window is repaid); the sheets' `interbankLentLocal`/`interbankBorrowedLocal` are derived from
  the book, in the leverage denominator, M5's identity and a resolution's transfer;
  `Region.interbankRateAnnual` is the struck average. `money-market.md` B2 ✅ B2.a ✅ B2.b ⚠️
  (readable, step 38's to read), `banks-funding-and-liquidity.md` D1 ✅. Gates green; no run.

**20-iii — OCCUPATIONAL SUPPLY MOVES TO WHERE THE VACANCIES ARE.** Step 20 is closed with this.
  Each occupation's labour force was `totalLaborForce × share`, the share drifting in
  `evolution.ts` by the occupation's wage gap to the average at three stated speeds (0.015 /
  0.008 / 0.003 a week) — a coefficient reading a price, not a person reading a vacancy — so a
  shortage stood: seekers at zero, hiring stopped, idle seekers next door. Now the labour stage
  runs a second matching pass (`labor-market.ts:occupationalMobility`): what each occupation's
  own search left unmatched is spread over what the others' left unfilled, each pair matched
  through the one matching function and capped by both sides, and the movers enter the new
  occupation at tenure zero (the entry wage is what retraining costs — DIST 1(b)'s bottom
  cohort, no new number). The shares are the state the flow moves, written by the labour stage
  and passed through by evolution untouched; the X4 drift is deleted. Slower than own search by
  construction, from where the idle are to where the openings are. Test: conservation, no move
  within an occupation, both-side caps, search not transfer. `labour.md` A3.a re-cited with a
  note. Gates green; no run.

**20-ii — EVERY OVERDRAFT LENDER LENDS TO ITS ROOM AND REFUSES PAST IT.** The close sweep funded
  every negative balance it found — a firm's revolver tap, a fund's prime-brokerage draw past its
  line, a pool's SME draw split by market share — whatever the lender's capital. Now each lender's
  room is read once off its own sheet (`banking.ts:leverageHeadroomLocal`, the bound every other
  book of the bank already carries) and consumed in the order the sweep reaches the draws; what
  it would not lend is REFUSED and stands negative through the close, recorded on the party's run
  (`OverdraftStreak.refusedLocal/refusedRunLocal`; a refused week is a week in the run, and the
  news tells the refusal beside the draw). The bank's sheet and the contract books move only by
  what was lent. What a refused payer IS — a default of payment, and the bank path's own
  unconditional central-bank loan — is 20-LLR's. `money-and-settlement.md` B3.a ✅, E1.a ✅ (E1
  stays ❌ for 20-LLR), `prime-brokerage.md` E4 ✅ (11 ✅ · 6 ⚠️ · 10 ❌), `fund-shares.md` F2,
  `the-derivative-layer.md` D4, `banks-lending.md` A3.a texts updated. Gates green; no run.

**20-i-b — THE ESTATE'S STOCK SELLS WHERE THE GOODS SELL.** The inventory was the last stated price
  in a death: a slice per week at `1 − min(0.9, hurdle × turnoverWeeks / 52)` off book, pro rata to
  the peers' cash. Now the dead firm is a SELLER in the goods auction: 05 admits an open estate's
  rows as offers at no reservation (`RegionMarketIndex.estateSellers` — a supplier of every row it
  holds and nothing else, its row written on the firm itself since stage 08 skips the dead), and
  at the filing every input lot becomes stock for sale on its own rows
  (`goods-ledger.ts:reclassifyInputLotsAsStock`: a receiver runs no plant; same holder, same
  good, a reclassification not a wire). What the stock fetches is struck by the buyers of the
  goods, the invoices collect onto the estate's account through trade settlement, and the
  estate's inventory is read off the rows as they empty. The firm's own turnover is only a
  deadline: what is unsold when it runs out perishes (`perishStock`), as at the close.
  `sellInventoryToPeers` and the input-lot transfer to peers are deleted. The news line says the
  stock sold at the goods auction and the plant went to the bidders. `firm-birth-and-death.md`
  D1 ✅, `corporate-credit.md` G4 ✅ (76 rows: 47 ✅, 21 ⚠️, 8 ❌). Gates green; no run.

**20-i-a — THE ESTATE'S PLANT CLEARS AGAINST BIDDERS.** Step 20 split per rule 1.10 (20-i-a plant,
  20-i-b stock, 20-ii the overdraft lenders' capacity, 20-iii occupational mobility; its LOLR
  clause was 20-LLR's subject already and is not duplicated). The workout's plant was `slice × (1
  − min(0.9, hurdle × weeks / 52))` allocated pro rata to the peers' cash — a stated haircut and
  a bound, nobody bidding. Now `sellPlantToBidders` offers each week's slice at any price in a
  PRICE_LIKE book (unit: one currency unit of net book) and the region's same-sector firms bid
  from their own books: reservation `min(1, ebit / net plant / hurdle)`, size ramping to the
  firm's own capital programme as the price falls to half its reservation, cash bounding what it
  pays at its reservation; the cleared price is paid into the estate's account, the plant moves
  at book, the print is kept on the estate (`plantPriceOfBook`) for the next solve, and what no
  bidder takes returns to the estate until the programme's last week abandons it. The news line
  says what a unit of book fetched. `firm-birth-and-death.md` D1 re-cited (plant ✅, stock still
  the schedule → 20-i-b), `the-capital-programme.md` D3 re-cited. Gates green; no run.

**19-ii — THE DEAD EXPORTS ARE GONE.** The sweep measured 389 exported names in 164 files that
  no other file read. The pass had two arms and `tsc`/`eslint` were the judge of each: the
  `export` came off all 389; the 86 names then used nowhere — `eslint`'s "never used" on the
  unexported declaration — were deleted with their comment blocks (`engine2/state.ts` 9 including
  the whole unused `WorldState` column interface, `units.ts` 6, `world.ts` 4, `intern.ts` 4,
  `company.ts` 4). Among the dead: `calculateForwardRate` (the IRS tree's C2 already said it had no
  callers), `weeklyFinancingLocal` (a restatement of the stage's own `interestLocal`), and
  `runPrimeBrokerageCloseSweep` — a whole close-cycle sweep that `core.ts` never scheduled, whose
  work `overdraft-sweep.ts` does; the-derivative-layer D4.a re-cites the sweep that runs.
  `PAYMENT_CATEGORIES` survived only as a type and is now the union it named. Net −765 lines in
  `src`; exports 2197 → 1808, dead 0. Four atlas rows re-cited (fx-spot C2.a, prime-brokerage A4,
  interest-rate-swaps C2, the-derivative-layer D4.a). Gates green; no run.

**19-i — THE DEAD DAMPER MACHINERY AND THE FX CAP ARE GONE.** The damper never bound: the JS
  kernel never wrote its flag, the C port only ever compared a solve to itself with no cap. Every
  piece of the machinery is deleted — `ClearingInstrument.damperBindStreak`, the engine's
  `damperStreak` and `damper` lanes, `damperBoundByIndex` / `damperBoundInstrumentIds` /
  `fillDamperIds`, `setDamperStreaks` / `rollDamperStreaks` and the raw-id streak map,
  `YIELD_LIKE_MIN_WEEKLY_MOVE_BPS` (a floor the damper justified: the repo haircut and the swap
  book's two-sigma move now floor at the engine's one-basis-point resolution with no history,
  and nowhere with it), the C kernel's `damper` output lane and its cap arithmetic (the addon is
  rebuilt from source by `build:native`; the output order shifts by one), the four workers'
  lanes and `maxWeeklyStatMovePct` job field, `WeeklyStepContext.damperBoundInstrumentIds` and
  the fourteen adapters' pushes, `GameState.lastWeekDamperBoundIds` / `damperBindStreakById`
  and core's roll, the audit's `P4` (a streak nothing wrote), the UI's clearing-book object and
  `diag` function and `books` list (the instrument-name helpers moved to
  `objects/instrument-ref.ts`), the tape's `bound` series, the harness's streak diagnostic and
  week-line column, and `MAX_WEEKLY_FX_MOVE_PCT` (no use site) with every comment that still
  described a boundary the model no longer has. Split per rule 1.10: 19-ii is the dead exports,
  measured at 389 names in 164 files. Atlas: fx-spot C6 ✅, the-clearing-engine and
  news-and-the-player-surface text, UNMAPPED. Gates green; no run.
- **18-iii — THE SMALL FLOORS AND CAPS ARE GONE, AND THE GUARD IS LOUD; 18 CLOSED.** Rule 6:
  the insurer's and pension's hurdle bands [2%, 30%] and the pension's 20% funded-ratio floor
  (a barely funded pension needs an enormous return, and says so); the prime-brokerage haircut's
  1% floor (an unmeasured haircut lends without limit of the fund's own; the broker's room is
  the limit that stands); the estate's floor at zero on a holder's equity (a loss past it is
  insolvency); `restateBankSheetStatistics`'s `max(0, cash)` on the reserve account (an overdraft
  reads as one); the central bank's QE pace cap and max-stock-share cap, both deleted — the rule
  orders what the blocked cut implies and 07c's float answers; `double-auction.ts`'s 10,000-step
  guard is now a defect past one step per order. `weather.ts` and `02-region-macro.ts` held
  nothing but divide guards. Atlas: the-central-bank C1 noted, hedge-funds D1 text. Gates
  green; no run.
- **18-ii — `stage08-back.ts`'S BOUNDS ARE GONE.** Rule 6: the payout ratio's `min(1, …)`; the
  ten-employee floor; the three `max(0.5, remainingYears)` pricing floors → the rung's own life
  with the clock's one week as its least; the two `max(50, …)` revolver-spread walk-aways; the
  5%-of-ladder prepayment pace; the CFO's walk-away floored at the current five-year print; the
  ten-dollar cash-buffer floor; the invented `cash + 0.8 × revenue − debt` book value with its
  0.5 floor → `companyBookEquityLocal`; the ±15% occupation-mix drift caps. The arithmetic
  guards stay (a divide by `max(1, x)`, a recovery at least 0, depreciation at most the asset).
  Atlas: firm-fundamentals E6 noted. Gates green; no run.
- **18-i — `evolution.ts`'S BOUNDS ARE GONE.** Rule 6, site by site: the tax rate's [0.10, 0.50]
  band and 0.25 fallback (a non-number is a defect at the site); the 1.5% cap on NAIRU
  hysteresis; the whole consumer-confidence index (an invented equilibrium off four
  coefficients, an equity return clamped ±0.5, the index clamped [30, 170]) with its field on
  `HouseholdState`, its seed, its telemetry and its two UI rows — its two readers read what it
  was made of: the migration signal and consumer-credit appetite (`bank-lending.ts`) read real
  wage growth, the appetite's ×2 cap gone too; the Taylor rule's bands (expectations
  [−20%, +50%] with a 2.5% fallback, both gaps ±10%, the target's 20% ceiling, the policy rate's
  [−1%, 20%] twice) — the ONE bound that stays is `EFFECTIVE_LOWER_BOUND`, a real thing; the
  commodity walk's 0.5 spot floor, ±4%/week imbalance cap and 0.9 weather cap (a loss is capped
  at all of the crop, which is arithmetic). The ±4%/week GDP clamp was already gone. Split from
  18 per rule 1.10: 18-ii (`stage08-back.ts`) and 18-iii (the small floors and the loud guard)
  inserted. Atlas: households C1.c re-cited, commodities-spot F3/D1 noted. Gates green; no run.
- **17f-v — SENIORITY, AND THE CDS BASIS MIRROR; 17f CLOSED.** `seniorityRead`: an issuer's
  senior rung against its subordinated rung nearest the benchmark tenor (`TR_SUBORDINATED` on
  the ladder rows), the trade where the junior pays LESS — the senior bought on the line, the
  junior sold and borrowed — carrying the junior's borrow fee and the senior's financing above
  repo; one direction (a seniority premium has no bound); `seniorityLegs`: the senior bought
  down to the spread that still pays the junior + carry, the junior a target. A cash-only pair:
  no margin to stop on, the line's capacity its limit. The CDS basis (17f-i) gains its mirror
  — a rich rung sold and borrowed, its cover written down to the rung + carry — and its position
  is net of the borrow. The lending pass lends ANY `lendable` rung (`runBondLendingPass`, the
  kind read off the ladder, the `bond-lending` stage), and 07b reads lent face and buy-ins on
  the staged row as 07c does. With this, every comparable the audit measures either has its
  trader in the registry or its own arbitrageur (ETF premium, cross-currency basis, the goods
  wedge): 17f is closed. Atlas: corporate-credit H3 cited, securities-lending B1 re-cited.
  Gates green; no run.
- **17f-iii — THE SWAP SPREAD.** Per swap tenor, the par rate against the sovereign rung nearest
  it: `swapSpreadRead` — received (long the line) against the rung shorted, carrying the rung's
  borrow fee and the swap's margin; paid against the rung bought, carrying the financing above
  repo and the margin; `swapSpreadLegs` — the swap received down to the yield + carry or paid
  up to the yield − carry (an `IRS_FIXED` leg in bps), the rung shorted as a target or bought up
  to the price the par − carry implies (`priceFromYield` on the rung's own terms). The swap book
  seats an `IRS_FIXED` leg (`indexHolderQuote`: a receiver above its level, a payer opening
  short and selling below it), opens a tenor for a seat with no hedger, and reads each seat's
  fill against its opening — above it received, below it paid (a payer joins the tenor's
  demands). `mergeLegs` folds two comparables' legs on one instrument (the ten-year rung under
  the bond basis and the swap spread) into one. Atlas: interest-rate-swaps B4 ✅. Gates green;
  no run.
- **17f-ii — THE INDEX AGAINST ITS NAMES.** `indexArbRead`: the series' last print against the
  equal-weighted mean of its constituents' benchmark prints, both directions, the carry the
  required return on the margin of BOTH legs (nothing is funded); `indexArbLegs`: a signed face
  on the line (written down to the mean + carry, bought up to the mean − carry) and the opposite
  face split equally over the names (each bought up to its print + the pair's spare, written
  down to its print − it). `readIndexBasis` in the stage: position = written − bought on the
  line, bought − written across the names; capacity = capital ÷ (index + names margin rates);
  stop and line as before. The index book takes a `CDS_INDEX_PROTECTION` leg as a seat; the
  CDS book now seats a book ONCE across all its `CDS_PROTECTION` legs (17f-i pushed one seat
  per leg under one id — fixed, rule 12). Atlas: cds A5.b cited. Gates green; no run.
- **17f-i — THE CDS–CASH BASIS JOINS THE REGISTRY.** The second comparable: for every active
  non-bank issuer in the fund's region with a protection print, the issuer's own rung nearest
  the benchmark tenor (`ladderRowsOf` through `IS_BOND_ROW`, with a cleared price and
  `rowSpreadBps`) against `cdsSpreadBps` at c5. `cdsBasisRead`: deviation = rung spread − cds
  (the negative-basis trade), carry = the line's financing above repo + the required return on
  the cover's margin; `cdsBasisLegs`: the cash leg buys the rung down to the spread that still
  pays cover + carry (`priceAtSpreadOnTranche` on the rung's own `trancheTerms`), the
  protection leg buys cover up to the rung less carry (a negative face: the credit sold).
  `stages/relative-value.ts` reads both comparables (`readBondBasis`, `readCdsBasis`); the
  position is the rung's face on the register and the fund's net cover (a − b) on the name;
  stop and line as before; a reduction sells the rung to target and WRITES the cover back
  (gross with the standing cover — two CDS lines of different maturity do not net, 17e-iv).
  07b takes a `CORP_BOND_CASH` leg as staged demand on the rung (`setDemand` on the fund's
  row: reservation price, size in face, budget in face, its current as the floor; a reduction
  a fixed target); the CDS book takes a `CDS_PROTECTION` leg as a one-sided seat
  (`indexHolderQuote`: a buyer opens holding its size and sells the credit below the level, a
  writer takes above it). Three pairs join for the measure only (ETF premium, cross-currency
  basis, the goods wedge — each already has its arbitrageur); 17f-ii/iii/v inserted for the
  index, the swap spread and seniority. Atlas: corporate-credit H4 cited. Gates green; no run.
- **17e-iv — OFFSETTING LINES NET AT THE HOUSE.** A LINE is a contract's identity — class,
  region, money, reference, tenor and maturity (`netting.ts:lineKeyOf`); a member striking the
  opposite seat on a line it holds nets against its standing slices, oldest first
  (`planOffsets`, pure, tested). `admitToHouse` now takes the view and nets before admitting
  (`netAgainstStanding`): each slice settles at the profile's mark through the house to the
  member leaving, that member's margin on the slice comes back (`releaseMemberMargin`, the
  per-member half of the release), the incoming counterparty takes the seat and posts the
  slice's margin (`postMemberMargin`), and the slice's settled mark restarts at the print;
  a whole offset re-seats the standing row in place, a partial one shrinks it and strikes the
  slice re-seated as its own contract (`contract-ledger.ts:reseatDerivative`,
  `obligations.ts:writeDerivativeSize`; the standing index is dropped for rebuild). Only the
  excess stands. A line with no print nets nothing. Two swaps struck on different weeks are two
  lines and stand gross. Atlas: the-derivative-layer B3 cited, C1.a ⚠️. Gates green; no run.
- **17e-iii-b — THE LENDING BOOK LENDS A SOVEREIGN.** `securities-lending.ts:
  runSovereignLendingPass`, run after `holdings-store` and before 07b: the region's loan book is
  one (`securityLoanBookOf`), partitioned by `isTrancheId` — the share pass carries bond loans
  through untouched and prices a bond loan's net at `trancheClearedPricePerFace`. The pass
  pays the fee and the variation margin at the rung's cleared price, RETURNS what a borrower
  holds beyond its stated need (`ctx.borrowNeeds` is the TOTAL face wanted; a recalled loan
  wants none) with its collateral, recalls by the share pass's rule (lender position below
  strike → buy-in), and auctions the increment (need − borrowed) per rung: holders' face
  (`sovereignRowsOf`) at `lendingReservationFeeBps` on `weeklyPriceMoveOf`, the print to
  `borrowFeeBpsByCompanyId[bondId]`, loans struck pro rata, delivered as FACE
  (`holdings.ts:setRowUnits`, the store's `addUnits`, `wireHoldingMove` with units) with cash
  collateral at the mark. `publishLent` is rebuilt each pass and keys a bond loan by its rung;
  07c lowers a lender's ceiling and floor by what it lent and makes a recalled borrower's
  buy-in a purchase at any price. Atlas: securities-lending B1 cited. Gates green; no run.
- **17e-iii-a — THE MIRROR TRADE, AND ITS BORROW NEED.** The pair has two directions with two
  carries: `bondBasisMirrorRead` turns the disagreement's sign and charges the paper's borrow
  fee (the lending book's last print for the rung, `borrowFeeBpsByCompanyId[bondId]`, 0 until
  it has one — an unpriced borrow the lending book prices the week it is asked) plus the return
  the long's margin needs; `arbTargetShare` is signed — the long-cash trade when its edge pays,
  the mirror when the future is cheap, none when neither. The book's position is NET: register
  face less what it has borrowed (`sharesOnLoan` on the region's loan book), long less short on
  the line; the pair's P&L adds the borrow's net (`stockLoanNetLocal` at the cash price) and
  signs each line's settled mark by the side the fund is on; the stop reads the margin on both
  sides. A cash leg below what the book holds sells what it has and states the rest as a
  `BorrowNeed` on `ctx.borrowNeeds` (17e-iii-b's lending book fills it); the future leg is the
  signed delta to the target's opposite. Two follow-ups inserted: 17e-iii-b (the lending book
  lends a sovereign, with a return path and 07c's lent read) and 17e-iv (offsetting lines net
  at the house). Gates green; no run.
- **17e-ii-b — THE BASIS TRADER IS CUT.** The book comes off as it went on: each leg is the
  delta to target, signed, so a target below the position is a REDUCTION — the deliverable sold
  in 07c to target at what the auction clears (`minHoldingLocal` = `maxHoldingLocal` = what it
  keeps), the line bought back below the edge price (`bondFutureHolderQuote` with a positive
  gap). Two cuts are FORCED (`RelativeValueLeg.forced`, the line's reservation put out of reach):
  the pair has lost more than the initial margin its shorts posted (`pairPnLLocal` = the
  deliverable's mark over its lots' basis + what the shorts have settled to it;
  `stoppedOut` against Σ `initialMarginLocal` of its BOND_FUTURE shorts on the bond — the
  house's own measure of the move it was carried for, no tolerance of the fund's own), or the
  position exceeds what its cash and its line carry (`arbCapacityLocal` fell: the broker's
  haircut widened or its cash went — the margin identity). Atlas: sovereign-credit I3/I3.a ✅.
  Gates green; no run.
- **17e-ii-a — THE RELATIVE-VALUE BOOK, AND ITS FIRST TRADE: THE BOND BASIS.** The registry
  of comparables is `domain/relative-value.ts`: a comparable is a READ (`ComparableRead`:
  deviation and carry, annualised bps of the pair's face; `edgeBps` their difference) and two
  LEGS (`RelativeValueLeg`: market, instrument, signed face, the price the leg is worth doing at,
  the range it scales in over, a cash leg's money). The book sizes by `arbSizeShare(edge,
  weeklyMove)` — full size once the edge exceeds the relationship's own weekly move — against
  `arbCapacityLocal` (spendable cash + what the broker will lend, the haircut already in it).
  First entry: `bondBasisRead` (net basis ÷ cash price ÷ T, less the line's financing above repo
  and the required return on the future's margin) and `bondBasisLegs` (cash leg up to the price
  at which the future still pays the carry; future leg down to carry plus that cost). The
  strategy `RELATIVE_VALUE` is the fifth (`HedgeFundStrategy`, its profile, a fifth seeded fund
  per region on the same size curve); `stages/relative-value.ts` runs after prime-brokerage and
  before 07b, reads the region's `bondFuturesBasis` and deliverable, the fund's line rate and
  `primeBrokerageAvailableLocal`, its deliverable face on the register and its short cover in
  the standing book, and states each leg as the delta to target on `ctx.relativeValueLegs`;
  07c takes a SOVEREIGN_CASH leg as the fund's own demand for that bond (reservation, size in
  FACE — that book's holdings are face — budget restated in face, `minHoldingLocal` its current), the futures line takes a BOND_FUTURE leg as a seat
  (`bondFutureHolderQuote` at the leg's price) and drops such a fund from the mandate loop.
  X2 gains the bond basis (a print more than 2 points from carry). Only ADDS this commit: the
  cut is 17e-ii-b, the mirror 17e-iii, both inserted. Atlas: sovereign-credit I3 ⚠️. Gates
  green; no run.
- **17e-i — THE GOVERNMENT BOND FUTURE.** A new class, `BOND_FUTURE` (`classes/bond-future.ts`):
  the DELIVERABLE is a named rung of the region's sovereign ladder (reference `{ kind:
  'SOVEREIGN', regionId, bondId }`, `REF_KINDS` 'SOVEREIGN'), the one nearest ten years from the
  next quarterly delivery (`deliverableOf`, `nextDeliveryWeek` on 13-week clock); price per unit
  of face, face as `units`; marks to the line's own print (`Region.bondFuturesPriceHistory` via
  the view's `bondFuturePrint`) and on the delivery week to the deliverable's cleared cash price
  (`sovereignBondPrice` → `trancheClearedPricePerFace`): cash settlement to the bond the short
  would have delivered. Margin = the ten-year rate's weekly move on the deliverable's modified
  duration (`bondDurationYears`), CEM add-on 0.015. The market (`derivative-markets/
  bond-future.ts`, one line per region, PRICE_LIKE): desks two-way at the CARRY price
  (`bondFuturesCarryPrice` = cash × (1 + repo × T) − coupon × T) sized by their derivative
  budget; duration mandates by the swap book's gap read (assets − duration paper − IRS cover −
  futures cover) long below carry, holders over their `govBondPct` target short above it
  (`bondFutureHolderQuote`, one side each; `twoWayPriceQuote` the price-like two-way). The
  print joins the history and `Region.bondFuturesBasis` = print − carry (`bondFuturesNetBasis`)
  is measured. Split per rule 1.10: the basis TRADER is 17e-ii, built as 17f's first comparable
  book. Atlas: sovereign-credit section I added and mapped (I1/I1.a/I2 ✅, I3 ❌). Gates green;
  no run.
- **17d-iii — THE CDS CURVE.** Four tenors (`CDS_TENORS` c1/c3/c5/c10, `CDS_BENCHMARK_TENOR` c5
  the one a name is quoted by and P2's cash comparison was at), one instrument per (name,
  tenor) (`cdsInstrumentId` takes the tenor), `CDS_TENOR_WEEKS` deleted for `cdsTenorWeeksOf`.
  A hedger's need is struck at the tenor nearest its exposure's size-weighted remaining life
  (`nearestCdsTenor`; an `Exposure` now carries `weeksLocal`: a facility's maturity, a desk
  row's tranche maturity, written protection at its own tenor, a receivable's due week, a
  contract's weeks remaining); every quoter quotes every tenor at the capital charge of that
  tenor (`spreadRiskCapitalChargeRate(rating, tenorYears)`), which is what makes the curve a
  curve. The store is `cdsSpreadHistoryByIssuer[issuer][tenor]`; the view's `cdsSpreadBps` /
  `cdsSpreadWeeklyMoveBps` take the tenor and read it (the company's `cdsSpreadBps` is the
  benchmark's last print, no longer the view's source); the mark and margin read the contract's
  own point. P2 measures every printed tenor against `issuerSpreadAtOnCurve` at the same
  point. The index's reservation uses its own five-year tenor. Atlas: cds A1/A1.d ✅. Gates
  green; no run.
- **17d-ii — THE CREDIT INDEX CLEARS.** The series on the run is one instrument
  (`creditIndexInstrumentId`, kind `CDS_INDEX` on the registry). On the line: the real-money
  holders by their TARGET GAP — an insurer or pension fund whose corporate-credit target
  (`allocationTargetFor`: corpBondPct + loanPct of its assets) exceeds its cash credit book
  (`institutionBookLocal` through the registry's `isCreditClass`) writes index protection for
  the gap at its reservation, one over its target buys for the excess below it
  (`indexHolderQuote`: one side each, the buyer opening holding its excess) — and 17c's two-way
  quoters (desks through `deskNotionalCapacityLocal(…, 'CDS_INDEX')`, credit funds at their
  capital) at the basket's reservation, the equal-weighted mean of their single-name
  reservations. The float is the openings; what a seat holds against its opening after the
  print is what it did; buyers draw pro rata from the writers; a new line carries
  `units = events so far` (struck on the survivors). The print joins
  `creditIndexSpreadHistoryBySeries` (the class's mark and margin), and
  `Region.creditIndexBasisBps` = print − mean of the constituents' single-name prints
  (`indexBasisBps`), one of 17f's comparables. Atlas: cds A5/A5.b ✅. Gates green; no run.
- **17d-i — THE CREDIT INDEX: THE SERIES AND THE CLASS.** A CDX is a fixed basket traded as one
  line, and the basket is a SERIES: `Region.creditIndexSeries` (names fixed at the roll, events
  settled once for the line), rolled every `CDX_ROLL_WEEKS = 26` by `derivative-markets/
  cds-index.ts` from the names the single-name book has printed (at least `CDX_MIN_NAMES`);
  a constituent that fails settles its weight for the series when its workout closes, at what
  it paid (the region's average when it left no estate). The contract's reference is the series
  (`{ kind: 'BASKET', regionId, seriesId }`, `REF_KINDS` 'BASKET', the row's region its region)
  and its `units` count the series' events it has settled — the lifecycle's new partial-event
  hook (`profile.ts:eventSettlement`, applied before the maturity check; `done` ends the line;
  `keepDerivatives` writes the count back through `writeDerivativeUnits`). `CDS_INDEX_PROFILE`:
  premium on the surviving share, mark = spread move on it as a risky annuity at the series'
  print + a failed name's expected payoff, held past maturity while a failed name's workout is
  open, CEM add-on 0.05. The view gains `creditIndexSeries` / `creditIndexSpreadBps` /
  `creditIndexWeeklyMoveBps` (off `creditIndexSpreadHistoryBySeries`, which 17d-ii writes). The
  market module settles AFTER the market so an event recorded this week settles this week.
  Split from 17d per rule 1.10: 17d-ii clears the line; 17d-iii (inserted) is the curve the atlas
  had pointed at 17d. Atlas: cds A5 nodes added and mapped. Gates green; no run.
- **17c — CREDIT PROTECTION HAS EVERY BUYER IT SHOULD, AND EVERY QUOTE IS TWO-WAY.** The CDS
  book's float was one regulatory quantity — a bank's loan-book excess over 25% of its equity —
  and nobody else could buy. (a) A bank's exposure to a name is now its facility rows AND its
  desk's paper on the name (`deskRowsOf` through `isTrancheId`/`issuerIdOf`) AND the protection
  its desk has written (the standing book's `b` side), one need at the same rule. (b) A firm's is
  its receivables on a buyer (`tradeInvoicesOf`, at the booked rate into the buyer's money), the
  contracts it still has to deliver on (`forEachContract`: units × price × weeks remaining, in
  the customer's money) and what it has paid a supplier ahead — against its own book equity
  (`companyBookEquityLocal` off `cashOf` + `ladderTotalLocal`), the firm a COMPANY member of the
  house. A need is routed to the REFERENCE's region and money, wherever the holder is.
  (c) Every writer quotes both ways: `twoWayProtectionQuote` states one reservation to the engine
  as a holder of its short capacity — a ramp of twice the range, flat at the reservation — so the
  same participant writes above its cost of the risk and buys below it; what it holds against its
  opening after the print is what it did, and a net buyer joins the buyers' allocation as a view.
  The float is the hedgers' need plus every opening short; a name the market has printed
  (`cdsSpreadHistoryByIssuer`) stays quoted with no hedger. `sellsCdsProtection` →
  `quotesCdsProtection`; `protectionNeedLocal`'s `bankEquityLocal` → `equityLocal`. Atlas: cds
  B1/B3/B4 ✅. Gates green; no run.
- **17b-v — THE SWAP LINES.** Step 17b is closed. `domain/swap-lines.ts`: the line's price is
overnight plus `SWAP_LINE_SPREAD_BPS` (25, the standing dollar lines' — a policy primitive like the
corridor), a draw runs `SWAP_LINE_TERM_WEEKS` (13), and the line lends what the funding market
left unfilled once the basis cleared PAST its price, or when nobody lent (`swapLineDrawLocal`);
while it stands the published basis is capped at the line's price (`cappedBasisBps`) — the cap
is the price, not a bracket. `stages/swap-lines.ts:drawSwapLine`: the lending central bank
creates its money and pays it to the borrowing region's bank (one cross-border instruction; the
settlement's official-claim write records the borrowing central bank's deposit at the lending
one); the borrowing central bank books the on-lending as its asset
(`CentralBank.swapLineLentByRegion`, foreign money, in `centralBankAssetsLocal` at today's rates)
and the home money it gave as its liability (`swapLineDepositsLocal`, in
`centralBankLiabilitiesLocal`); the lending central bank books that home money as FX reserves;
the bank books what it owes (`BankingSector.swapLineDrawnByRegion`, read in its money by
`banking.ts:swapLineDrawnLocal`) — a foreign-money liability that revalues as its foreign
reserves do, in the identity trace, the harness residual, the statement, M5, the resolution
plan and the assumed liabilities, the seed's funding residual, the diversification's split and
sum, a merger's transfer and the revaluation's net. `serviceSwapLines`, run by the funding
market before each week's book: interest at overnight plus the spread paid to the borrowing
central bank in its own money and remitted with its loan interest; at term the unwind at the
original rate — the bank returns the foreign money to the central bank that created it and
every line reverses. `xcs.ts:runXcsMarket` calls the backstop per pair after clearing, pro rata
to each borrower's unfilled need. M2 gains "swap lines = banks' draws" per foreign money; the
news tells every draw (7f, `swap line drawn`, urgent). Atlas central-bank D3 cites the line and
stays ❌ (freely and at a penalty, but unsecured and to any bank), fx B3.a re-cited with the
cap. `test/swap-lines.test.ts`: the draw rule, the cap, the interest; the draw on both books at
today's rate. Gates green; no run.

**17b-iv-b — ONE BASIS.** The forward prices off the funding basis. `classes/fx-forward.ts`:
`cipForwardRate` (spot carried at the holder's and the issuer's overnight rates over the tenor)
and `forwardStrikeOf` (parity moved against the holder by the basis); the forward's mark is
against the forward for the tenor LEFT, so at strike a parity-struck forward is worth nothing and
the carry is earned, not booked. `derivative-markets/fx-forward.ts`: the per-pair basis CLEARING
— the hedgers' schedules against the desks' float — is deleted; a desk carries its charge over
funding (`registry.ts:balanceSheetChargeBps`, the return it needs on the capital a forward
consumes — one arithmetic with the swap lender's reservation), the pair's all-in basis is the
swap book's funding basis (`Region.xcsBasisBps`, zero where nobody is short the money) plus the
desks' capacity-weighted charge, each holder takes of its gap what that basis leaves worth
hedging (its own schedule: full size when free, nothing at its tolerance), the desks' float caps
the fills pro rata, and the strike is `forwardStrikeOf` at the two overnight rates. The region
publishes the forward basis as `crossCurrencyBasisBps` — derived from the funding basis, not a
second print of one price — and the spot desks' quote width reads it as before. `evolveFxPair`
(the last formula on a pair: the basis walked by a rate differential times 20 plus noise),
`FxPair.basisSpreadBps` and its seed are deleted; the pair page shows the funding basis and the
forward basis, both cleared. `fxBasisInstrumentId` goes with the book. Atlas fx B2, B2.a, B3
✅ (A1.c, B1, E1 stay ⚠️: parity is applied and the basis is the cleared part; the RATE is not
what participants bid), currency-and-fx E3 ✅, fx-spot E2 ✅, cross-border E4 re-cited; 37-SMALL's
fx-forwards bullet closed. `test/derivatives.test.ts`: parity, the basis against the holder,
worth nothing at strike, the carry earned by expiry. Gates green; no run.

**17b-iv-a — THE CROSS-CURRENCY SWAP, AND THE FX FUNDING MARKET.** A LEG SAYS ITS MONEY:
`profile.ts:DerivativeLeg.currency` (absent = the contract's), a profile's legs for the week are
one, several or none (`DerivativeLegs`), and `payThroughHouse` pays each leg through the house of
its own money, keeping each member's net in the contract's — so a two-currency instrument exists
on the one book (`derivative.md` D5 ✅). THE CLASS (`classes/xcs.ts:XCS_PROFILE`, roles BORROWER
and LENDER, the CEM FX add-on): the borrower's home region is `regionId`, the FOREIGN region the
reference, the foreign money the contract's currency, the foreign notional `notional`, the HOME
notional at strike `units` (the store's one free number, and it is what the end returns), the
basis `strike` in bps; the strike week's periodic leg is the notional exchange both ways, every
week after the interest both ways (foreign overnight plus the basis on the foreign notional,
home overnight on the home notional), the mark the value to the borrower of the final exchange
at today's rate, and maturity an event termination that exchanges the notionals BACK AT THE
ORIGINAL RATE and returns the variation margin that collateralised the move — the value realised
once, in the exchange (C3). THE MARKET (`derivative-markets/xcs.ts:runXcsMarket`, per
borrower-region/foreign-region pair, `xcsFundingInstrumentId`, kind `XCS`): who borrows is a
home bank whose desk ended the last close short the foreign money (its securities account's
foreign row below zero — the nostro position `fx-funding.ts` rightly does not treat as a client
shortfall), less its standing swaps, to its limit at the house; who lends is the foreign region's
banks from their reserves on the one derivative budget, each at a reservation basis that pays its
required return on the capital the swap consumes (`lenderReservationBps`); the book clears the
basis (the stat, bps) and the borrower region publishes it (`Region.xcsBasisBps`); the fills
strike at a year (`XCS_TENOR_WEEKS`), the home notional at today's rate, admitted, struck,
margined; the class settles AFTER its market so the strike week's settle exchanges the notionals.
Atlas fx C1, C2, C3, C4, D3 ✅, C1.a ⚠️ (overnight rates, not curves), B4 ⚠️ (the number
exists; the join with the flows is 38's), B3 stays ⚠️ with the reason sharpened — the funding
basis and the forward book's hedging basis are two prints of one price — which is 17b-iv-b.
`test/derivatives.test.ts`: the exchange both ways at strike, worth nothing at its own rate,
interest on both legs in both monies, the mark on the rate's move, the exchange back with the
collateral returned; the lender's reservation. Gates green; no run.

**17b-iii — THE OPTIONS MARKET.** Index puts, per region
(`derivative-markets/option.ts:runOptionMarket`, the class's slot filled). WHO NEEDS COVER: every
institution with an equity book (`institutionBookLocal` over `assets:isEquityClass`), sized by
the one hedging arithmetic every other market uses — `exposureToHedgeLocal` with the book as the
exposure, the holder's own surplus as what absorbs a one-sigma fall over the tenor (the index's
realised vol × √(13/52)), its management's risk aversion — less the puts it already holds
(`standing.coverLocal('OPTION','a', …, region)`), no more than it can margin at the house. WHO
WRITES: the banks' desks on the one derivative budget and the hedge funds whose strategy sells
volatility (`HedgeFundStrategyProfile.sellsVolatility`: global macro and long/short equity),
each at a RESERVATION VOLATILITY — `option.ts:writerReservationVol`: the volatility it expects
to realise plus the premium that pays its required return on the capital the position consumes
(the class's PFE add-on against the leverage floor), turned into vol points through the
at-the-money identity price ≈ 0.4·S·σ·√T (`ATM_PRICE_PER_VOL_SQRT_T`, tested against
Black–Scholes). THE BOOK: one instrument per region (`indexOptionInstrumentId`, kind `OPTION`
admitted to `registerBook`), stat the implied volatility in vol points, YIELD_LIKE, cleared by
`clearFinancialAsset` from the writers' schedules against the holders' float; the region
publishes `indexImpliedVol` and the view's `indexAnnualVol` reads it first, so the class prices
at the implied volatility the book clears and the realised one only before a print. THE
STRIKE: at-the-money puts on the region's composite (`DerivativeReference` gains `INDEX`, a
sixth arm; `indexReferenceOf`; the profile's `underlyingOf` serves shares and index alike) at
the listed tenor (`OPTION_TENOR_WEEKS` = 13), each holder's cover drawn from each writer pro
rata, admitted against the members' limits, struck, margined; the premium fires in the settle
that follows. The strike is at the latest PUBLISHED index level (stage 12 recomputes the index
after this phase) — stated, not hidden. `test/derivatives.test.ts`: the put on the index, its
margin on the index's move, a fall pays the fall; the reservation is the realised vol with no
capital, more with; the at-the-money identity within 0.2 points of Black–Scholes. Gates green;
no run.

**17b-ii — THE LEGACY DERIVATIVE LAYER IS DELETED.** `derivative.md` D1.a: stage 12 marked six
position kinds — IRS, CDS, TRS, XCS, COMMODITY_FUTURE, OPTION — by formula, against nobody, and
paid their gain into the player's cash from nobody; `executeTrade`, the only thing that could
open one, has no caller (37-SURFACE), so the layer was dead and wrong at once. The step as
inserted said "the player becomes a party and its derivatives move onto the one book"; read
against 37-SURFACE that is the ACTOR step — an actor is a party with an account whose orders
are ordinary participants in the books that clear — and building a party for a layer nobody can
open would have been building on the vestige. So: deleted. `AssetType` is the five cash kinds
(`EQUITY`, `CORP_BOND`, `LEVERAGED_LOAN`, `GOV_BOND`, `FX_SPOT`); `Position` loses the six
directions and the option fields (its bond terms stay); stage 12's six cases, `pricing.ts`'s
`calculateParSwapRate`, `priceInterestRateSwap`, `priceCreditDefaultSwap` and
`priceCrossCurrencyBasisSwap`, the carry calculator's six branches, the dealer book and margin
tables' six rows, the portfolio's gamma and vega aggregates, the harness's scripted swap and
protection positions and the news feed's swap, protection and futures trade shortcuts go with
them. Every derivative in the model is a contract on the one book with a `b` side. Atlas
derivative D1.a ✅, layer F1 ✅, swaps E2 ✅ (the only par rate is the cleared one), fx C1.a
re-cited absent, cds prose. No new test: a deletion of what nothing exercised. Gates green; no
run.

**17b-i — THE OPTION CLASS ON THE ONE BOOK.** `DerivativeClassId` gains `OPTION`
(`classes/option.ts:OPTION_PROFILE`, roles HOLDER and WRITER, the CEM equity add-on): the
premium is a periodic leg that fires ONCE — the option's value at the strike week's print, paid
holder to writer in the week the contract is struck, which is the first settle it sees because
its market settles after it strikes (`derivative-markets/option.ts`, the class's slot, striking
nothing until 17b-iii); the mark is the option's value, Black–Scholes at the name's own realised
volatility (the one pricer the model has, `engine/blackScholes.ts`, which stage 12 already read
— the domain imports it rather than carry a second copy; a volatility IMPLIED by a book is
17b-iii's), so variation margin moves the value week by week; expiry is an event termination
at intrinsic value, 'option exercised' or 'option expired', the true-up beyond what the mark
paid. The reference is the issuer's `SHARES` (`DerivativeReference`, a fifth arm in the
obligation store; `sharesReferenceOf`, `optionTypeOf` off `termKey` CALL|PUT, `strike` per
share, `units` the shares, `notional` the exposure at strike); the view reads the shares'
print, realised vol (the name's off its price ring, its region's index before it can estimate
one — stage 12's own read, `priceSeriesOf` a READ off `rowById`, not `rowOf`, which allocates)
and weekly move. `test/derivatives.test.ts`: the premium once and equal to the value, never
again; in the money worth more than intrinsic; no vol, no mark; exercised beyond the mark,
expired giving it back, a put pays the fall; every class's completeness. Gates green; no run.

**17-vi — A CREDIT EVENT SETTLES AT THE ISSUER'S OWN WORKOUT.** Step 17 is closed. The view
exposes the reference's workout (`derivative-lifecycle.ts:buildDerivativeMarketView`
`issuerWorkout`: OPEN while `ctx.estates` holds its estate unclosed, CLOSED with
`estate.ts:realisedUnsecuredRecoveryRate` — what the bonds and the paper actually got back,
the class protection references — undefined when the issuer left no estate). `cds.ts`: a
triggered contract pays no premium, marks at its expected payoff (the realised recovery once
closed, the region's average while open — so variation margin moves the bulk at the event and
the settlement is the true-up), holds past its maturity while the workout is open
(`profile.ts:holdsPastMaturity`, honoured by the lifecycle's maturity branch), and
`eventTermination` settles when the estate closes at what it paid; only an issuer with no
estate to wait for settles at the region's average, the stated fallback. Atlas cds A1.b, D2,
D2.a ✅. `test/derivatives.test.ts`: waits while open, marks at the expectation, no premium,
outlives maturity, settles the true-up at the realised rate; the unsecured class alone counts.
Gates green; no run.

**17-v-iii — THE MARKETS SIZE TO THE LIMIT.** Step 17-v is closed. A strike's margin rate
exists before the contract does: `registry.ts:initialMarginRateOf(shape, view)` is the
reference's move per unit of notional off the class, reference, tenor and remaining life
(`initialMarginAtStrike` is notional × it), and
`derivative-lifecycle.ts:memberNotionalCapacityLocal` is a member's remaining capacity through
that rate, in the contract's money — unbounded where the strike posts nothing —, with
`reserveMemberCapacity` drawing the market's one capacity read down by what it sized, so a
party's second hedge this week is sized against what its first will post. Every side of every
market: CDS caps a bank's protection need per name and reserves it, and a desk's and a credit
fund's writing per name; IRS caps a bank's and a firm's pay-fixed hedge per tenor
(`sizedToLimit`) and a receiver's duration gap; the commodity future caps a producer's units,
the desks' arbitrage, a consumer's and a macro fund's longs (`unitsToLimit`, at spot); the FX
forward caps each holder's gap per pair (`gapToLimit`) and the desks' float per pair
(`deskFloatLocal`, the PFE budget and the house limit at the pair's rate, the smaller). The FX
strike admits against a FRESH read (`admission`): the sizing reserved what each holder asked,
the print fills less, and what is struck is what posts. The cut at the strike (17-v-i) is now
the exception; `ccpRefusedNotionalLocal` measures how often it is not. `test/ccp.test.ts`: the
rate off a view, none where no move is measured; the capacity through the rate, unbounded at
zero, and a reservation sizing the next hedge. Gates green; no run.

**17-v-ii — THE MARKET VIEW.** The "stats on the derivative markets overall": one read,
`contract-ledger.ts:houseViewOf(v2, region)` — the house's open interest per class (contracts,
notional), its sheet (`ccpSheetAt`), and every member with the margin and fund it has at the
house and, per class, its contracts, gross and NET position, the class's first role (pays fixed,
buys protection, long the future, hedger) counted long and the other side short so a member on
both sides nets; members largest margin first. The region's new `derivatives` function
(`ui/functions/derivatives.tsx`, a tile on the region object) shows the sheet with own capital,
the week's refusals and the latest waterfall, open interest by class, and the members table with
net / gross per class; the harness prints the same per house under `DRV_TRACE=1`
(`printDerivativeMarkets`), a measure beside `INS_TRACE`. `test/ccp.test.ts`: two forwards
either way round and a swap — open interest by class, margin held both sides, each member's
margin, fund and net per class, the dealer short what the fund is long. Gates green; no run.

**17-v-i — CAPACITY IS A CLEARING-MEMBER LIMIT, AT THE STRIKE.** The house limits every member
alike: it may carry at the houses no more initial margin than its liquid cash could re-margin
over the close-out horizon — the stress call on a member is (√`CCP_CLOSE_OUT_SESSIONS` − 1) ×
its margin, so `clearing-house.ts:memberMarginLimitLocal` = cash ÷ (√5 − 1), and
`memberMarginCapacityLocal` is that less the margin it has at the houses from earlier weeks
(`memberMarginPostedLocal` takes `beforeWeek`; this week's postings have already left its
pending cash). Liquid cash is a bank's reserves, a fund's `institutionSpendableLocal` (net of the
collateral it holds), a firm's cash, each with the week's pending legs. Rule 5, the margin leg
and the contract in one pass: `derivative-lifecycle.ts:admitContract` cuts a contract to the
smaller of its two members' admitted shares (`admittedShareOf`, `scaledContract`: size, units
and margin together) or refuses it below a dust share, drawing the members' capacity down as it
admits; `admitToHouse` runs a market's whole strike through one capacity read. CDS, IRS and the
commodity future admit, then strike, then post; the FX market admits per holder at the desk,
where its per-holder budget (margin ≤ spendable cash net of the week's commitments — the same
rule's weaker form) stood and is deleted, and `settledNetByParty` with it. What was cut is the
region's `ccpRefusedNotionalLocal`, opened at zero with the week's first derivative market: a
§6 measure, and 17-v-iii's number. Atlas C5 and commodity-futures E2 cite the limit.
`test/ccp.test.ts`: the limit and the share arithmetic; a three-contract strike where the
first fits, the second is cut to what is left and the third fits nothing, the refusal recorded.
Gates green; no run.

**17-iv-c-ii — THE WATERFALL.** Step 17-iv is closed: a member's default is the house's to
absorb, in a stated order. `derivative-lifecycle.ts:resolveMemberDefault` — reached from the
estate's opening (`closeOutDerivativesOfParty`, which now returns the rounds) and from the
settle's dead branch (a dead member's contracts gathered per member after the walk) — closes the
member's contracts out at the mark: the survivors are paid in full by the house and get their
margin back, the defaulter's leg is not written, and what it owed the house NET across its
contracts at each house is the loss `clearing-house.ts:runWaterfall` absorbs in order — its
margin (kept), its fund contribution, the house's own capital (`ccpOwnCapitalLocal` plus the
week's pending legs), the survivors' contributions written down pro rata
(`writeDownSurvivors`; a bank survivor books the write-down against equity — C4.a, a real loss on
a real sheet) — and past the end nothing: `O15` reports the house short and the news tells it.
A defaulter owed money net is paid it, and margin or contribution the round did not consume goes
back to it. What its own money did not cover is the house's UNSECURED claim on the estate:
`ClaimHolder` admits the `CCP` arm, `EstateClaimType` gains `DERIVATIVE_CLOSE_OUT`, the estate
stage files it at opening and pays it as itself (`holderRef`; nothing to take off a book) — the
super-seniority atlas E2 recorded (the close-out paid out of the estate's cash ahead of every
ranked claim; 37-ESTATE) is gone with it. Every round is `Region.lastWaterfall`
(`WaterfallRound`: who, the loss, what each line paid, the unfunded rest, the claim), told by
news 7e — "closes out", "draws on its members", "runs past the end of its resources". Atlas C4,
C4.a, E2, E3 ✅; C5, E4 ⚠️ (a survivor is still paid in full past the end, and the round records
lines, not each survivor's share). `test/ccp.test.ts`: the order, the claim, past the end, a
house already short gives nothing; the pro-rata write-down and the defaulter's row leaving the
fund. Gates green; no run.

**17-iv-c-i — THE DEFAULT FUND.** The house's sheet has C3's three lines. The fund is rows of
the contract store — `obligations.ts` kind `CCP_FUND`, one row per member per house, the house as
A and the member as B (`clearing-house.ts:CcpFundContribution`; `contract-ledger.ts:ccpFundOf`
memoised on the kind's epoch, `publishCcpFund` whole like the repo book, `ccpFundLocal`,
`memberFundContributionLocal`). Sized COVER-ONE: initial margin is one session's move
(§3.17-ii), a defaulted book takes `CCP_CLOSE_OUT_SESSIONS` (5) to close out and the move over
the horizon scales with its square root, so the fund is the largest member's margin ×
(√5 − 1) (`coverOneFundLocal`, off `contract-ledger.ts:membersOfHouse`), shared pro rata to each
member's margin (`fundContributionsOf`). `derivatives.ts:trueUpDefaultFunds` runs after the
week's last derivative market: each member pays its share in or is refunded to it, through the
account its margin moves through (`memberMarginAccount`), and a member that has left is refunded
whole. A bank's asset at the house is margin plus fund (`bankAtHouseLocal`, in
`bankBookAssetsLocal`, the identity trace, the harness residual and the statement). The house's
own capital is the residual `ccpOwnCapitalLocal` = cash − margin − fund (no shareholders, no fee:
what it retained), and `O15` holds cash to margin plus fund. Atlas C3 ✅. `test/ccp.test.ts`:
cover-one and the pro-rata shares, the rows read back and a member's contribution is its asset,
the true-up pays each member's share in, moves nothing at size, refunds a member that left.
Gates green; no run.

**17-iv-b — NOVATION: EVERY MEMBER FACES THE HOUSE.** No member pays another.
`derivative-lifecycle.ts:payThroughHouse` (was `payToB`) writes every leg — periodic, mark, event,
close-out — as two: the paying member to the clearing house of the contract's money, the house to
the other member; the house is flat on every leg by construction and each member's settled net is
unchanged. Both members post initial margin (`postInitialMargin`; `ccpMarginHeldLocal` counts
`MEMBERS_PER_CONTRACT`), and margin is an asset swap, not income: a bank member posts from its
securities account (`clearing-house.ts:memberMarginAccount`) and carries what it posted as an
asset — `contract-ledger.ts:memberMarginPostedLocal` / `bankMarginAtHouseLocal`, folded into
`desk-register.ts:bankBookAssetsLocal` so the leverage ratio and the resolution plan see it, and
a line of its own in the identity trace, the harness residual and the statement. A member that
has ceased to exist pays nothing and is paid nothing, and the house's leg to the OTHER member
stands: `closeOutDerivativesOfParty` and the settle's dead branch no longer end a contract flat
when one side is GONE — the survivor is paid by the house, the house keeps the departed member's
margin, and what it cannot recover shows in `O15` as cash short of margin until 17-iv-c's
waterfall funds it. (The `O9` measurement 17-iv-b's entry promised is already the members' marks
summing to zero; the house carries none, so there is nothing new to sum.) Atlas C2, C2.a ✅; C1
❌ (there is no bilateral book left); E2/E3 re-read: the survivor is the house. `test/ccp.test.ts`:
both members post, the bank from its securities account; A pays the house and the house pays B; a
departed member's leg is not written and the survivor is still paid. Gates green; no run.

**17-iv-a — THE CLEARING HOUSE IS A PARTY WITH A BALANCE SHEET, AND HOLDS THE MARGIN.** The
region's derivatives central counterparty is a `PartyRef` (`party.ts` kind `CCP`, keyed by
region; `ccpParty`), distinct from the cash books' `CLEARING_HOUSE` pass-through: it has CASH,
rows at the region's banks carried week to week like a pool's, a leg landing by market share
(`accounts.ts:buildAccountMirror`, a `CCP` account class), read as `ccpCashOf` and as a fifth
deposit line on each bank (`DepositLines.ccpLocal`, `ccpDepositsAt`). Initial margin is posted
TO it: `postInitialMargin` pays A's margin to the house of the contract's money
(`domain/clearing-house.ts:ccpOfContract` — a contract states its currency, so the house that
holds its margin is the one that keeps its books in it) and `releaseInitialMargin` has the house
return it, whoever the B side is; a contract between two non-banks posts now too, and a GONE
party's margin stays with the house. So the dealer holds no client margin: `clientMarginLocal`
(a scalar beside the deposit lines, first a running total nothing reduced and then a read of a
lien) and the lien on the desk's securities account (`syncMarginLiens`, the derivative half of
`O13`) are deleted, `spendableDepositsOf` with them — every deposit is a depositor's rows and
`depositsOf` is the money stock's read (M6 loses its "margin moved with no row" tail). The
house's sheet is `CcpSheet` (cash held, margin held; `contract-ledger.ts:ccpSheetAt`), and `O15`
holds its cash to the margin its live contracts posted. Atlas C3 ⚠️ (its default fund and
capital are 17-iv-c's), D3 re-cited ✅, money A4 re-cited. `test/ccp.test.ts`: the key reads
back, the house is the contract's money's, its cash is its rows and each bank's row is a line,
the sheet off the books; `test/contract-ledger.test.ts`: a strike writes no dealer lien. Gates
green; no run.

**17-iii — VARIATION MARGIN IS THE MARK, FOR EVERY CLASS.** A swap and protection were worth
zero between their weekly nets and were valued exactly once, at a counterparty's death,
undiscounted. `irs.ts:markToMarketUSDToA`: the remaining fixed-leg difference against today's par
on the notional, discounted at the par rate (`pricing:annuityFactor`), zero at maturity, null
without a print. `cds.ts:markToMarketUSDToA`: the spread move on the notional over the weeks
left on a RISKY annuity — discounted at the overnight rate, survival-weighted at the hazard the
cleared spread implies (`spread / (1 − recovery)`); the credit event pays par less recovery LESS
what the mark already paid the buyer. Both classes strike with `settledMarkLocal: 0`, the one
lifecycle settles each week's change as variation margin beside the periodic net, and the
close-out at a death is the mark's delta — so `closeOutUSDToB` retires to zero for both, and the
undiscounted replacement values 17-vi named are gone with it (17-vi keeps the credit event's
recovery). `O9` now measures Σ marks = 0 on the whole book (atlas A4 ✅; D2.b Σ paid = Σ
received holds by construction, one instruction per delta, and is step 38's to sum). Swaps D1–D3
✅, D3.a/D4 ⚠️; CDS A3 ✅. `test/derivatives.test.ts`: the swap's mark is the discounted
difference and telescopes to zero, protection's is the risky-annuity move, every class marks.
Gates green; no run.

**17-ii — INITIAL MARGIN IS THE REFERENCE'S OWN MOVE.** `initialMarginRate` — 0 for IRS, CDS and
commodity futures, 0.02 for every FX forward — is deleted. A class profile states
`closeOutMoveOf(c, view)`: the move the position can make over one session (the model's clock is
the close-out horizon), as a fraction of notional, off the world's own prints
(`domain/volatility.ts`): a commodity's realised weekly move on its prints (its own path's sigma
before it has printed enough), a pair's realised weekly move on its `historicalRates`, a swap
tenor's rate move in bps off the region's `historicalZeroCurves` on the swap's remaining life, a
name's protection-spread move in bps on the protection's remaining life — off a print ring the
CDS book now keeps per name (`Region.cdsSpreadHistoryByIssuer`, `MEASURE_WINDOW_WEEKS` deep).
`registry.ts:initialMarginAtStrike(c, view)` is notional × that move, `withInitialMargin` wraps
what the four markets write, and the market view carries the four measures. A reference on its
first print has no move to measure and posts nothing — F2's stated reason, not a rate. D5 rises
for a new contract as volatility rises; a live contract is margined once, at strike, until the
CCP (17-iv) calls it daily. Atlas D1 ✅, D5 and F2 ⚠️, `derivative.md` D9 re-cited.
`test/derivatives.test.ts`: each class's margin is its move on the notional, it rises with the
move, and no move posts nothing. Gates green; no run.

**17-i — THE MARGIN A CONTRACT CARRIES IS WHAT WAS POSTED.** `initialMarginLocal(c)` re-derived
every contract's margin from its class's stated rate on every read — the lien on the dealer's
account, the audit's claim, the release at the end — so a margin could never be anything but
that rate, and sizing it from risk had nowhere to live. Now the margin is a FIELD of the
contract, `contract.ts:initialMarginLocal` (a column of the obligation store, written at strike,
materialised with the row): the four markets size it once at strike
(`registry.ts:initialMarginAtStrike`, still the stated rate until 17-ii) and post it through one
path for every class, `derivative-lifecycle.ts:postInitialMargin` (A pays the dealer's securities
account; the FX book's inline posting and its budget test now use it; the three classes with
nothing to post post nothing); `initialMarginLocal` reads the field; the lien, the audit (O13)
and the release read exactly what was posted. Step 17 is split into 17-i..vi, inserted in
order. Fixtures carry the field; the ledger test's lien is the posted amount. Gates green; no
run.

**16b-iii — THE INSURANCE MARKET, MEASURED.** `scripts/harness.ts:printInsuranceMarket`
(`INS_TRACE=1`): per region and week, each insurer's share of the cover written and its
week-on-week move, its share of the sector's surplus, its quote in bp, and the cover nobody could
write — the two things 16b asked to verify (shares move; an insurer whose surplus is gone loses
book first, its cover share falling below its surplus share) as a measure §6 watches, not a
check that fires (rule 11: no run, no number here). With this 16b is done. Gates green; no run.

**16b-ii — A POLICY MOVES TO THE INSURER THAT PRICES LOWER.** `institutions.ts:
placeInsuranceRenewals`: each week every book's renewing slice (a year's policies, one week's
worth at a time — `INSURANCE_POLICY_TERM_WEEKS`) and the growth of what there is to insure go to
the lowest quote with CAPACITY, the cover its surplus can stand behind at its own rate
(`surplus × PREMIUM_TO_SURPLUS_RATIO / rate`, less what it keeps), then to the next lowest; an
insurer with no surplus writes nothing and loses its renewals, so it loses book before it loses
its licence; a quote of zero writes nothing (nobody sells cover for nothing); a base that fell
faster than a term's renewals squeezes every book to it; cover nobody can write is unplaced and
pays no premium (`Region.insuranceUnplacedCoverLocal`, a read of the market's outcome). The stage
quotes every insurer first (16b-i) and places against those quotes, so next week's premiums are
next week's cover at next week's price. Tests: the cheaper insurer takes every renewal, the
insurer with no surplus keeps only what has not renewed, capacity binds and the next quote takes
the rest. Gates green; no run.

**16b-i — AN INSURER HAS A BOOK, A PRICE AND ITS OWN LOSSES.** The three insurers were price-
takers: each wrote the premium its capital let it (`surplus × PREMIUM_TO_SURPLUS_RATIO`), the
stage pooled every insurer's premiums, split the pool between firms and households by what they
had to lose, handed each insurer its CAPITAL share of it and paid claims at the POOLED loss
rate — no insurer had a price, a book or its own losses. Now `institutions.ts:InsuranceBook` on
the entity: the cover it stands behind (the insurable base its policies cover), the rate it
quotes, and its own trailing loss per unit of cover. `quoteInsuranceRate` is the price: the claims
a unit of cover is expected to bring plus the hurdle on the surplus held against the premium —
`loss / (1 − hurdle / PSR)`, the hurdle `entityRequiredReturn`'s own — so worse experience or
dearer capital quotes higher. The profile writes the book at its rate and draws its OWN claims off
its own cover and experience (the seed's 0.70 loss ratio and its noise stay 31b's, now applied
to the loss per cover); the book opens the first week at what the seed stated
(`openInsuranceBook`: the region's cover split by capital, at the one rate that makes the
region's premiums what its capital let it write). The stage pays each insurer its own premiums
from every policyholder's share of what there is to insure, returns each insurer's own claims,
records each insurer's own underwriting result, moves its experience one policy-term step toward
what the week cost it, and re-quotes. The cover still follows the insurable base at each
insurer's seed share — 16b-ii moves it. Atlas A4.a ⚠️. `test/insurance.test.ts`. Gates green; no
run.

**16-ii — A BOND TAP.** A corporate deal REOPENS the bond it has. `primary-market.ts:tapTargetOf`
names the issuer's senior fixed bond whose remaining life is nearest the standard tenor and
within a year of it, and only one a market has printed (a tap prices off a real price); stage
08's three offering builders (a refinancing, a term-out, an opportunistic deal) carry it as
`tapOfTrancheId`. 07b then lists the deal AS THAT BOND: the offering is added face of a paper
the book already prices, cleared in the same solve as its outstanding stock at its own price
with the walk-away riding on it (`primaryWithdrawStat`), the terms handed back are the bond's
own, and the settlement records what the deal listed as (`listedInstrumentId`). Stage 08 taps
the row with the placed face at the cleared price (`tapTranche`) — the buyers' rows are the
book's own fills on that tranche, its accrued leg is the seasoned paper's and goes to the
issuer as it already did, the price is the bond's own print — and counts the tapped face as
pre-action so the pro-rata action does not hand the holders the same paper twice. A debut, an
issuer with no printed bond near the tenor, or a tap whose bond was called between the announce
and the book, brings a fresh tranche exactly as before. With this, step 16 is done.
`test/tap.test.ts`. Gates green; no run.

**16-i — A TAP, NOT A NEW FACILITY: THE LEDGER TAPS, AND A REVOLVER IS ONE LINE.**
`tranche-ledger.ts:tapTranche(v2, issuer, row, addedFace, price, reason)`: face is added to the
EXISTING row, the holder of record takes it by wire at the tap price (the proceeds are price ×
face), and the row's coupon or margin, maturity and lender are untouched — no other holder's row
moves. `drawRevolver(v2, issuer, bankId, draw, {marginBps, week}, reason)`: a borrower has ONE
committed line per lending bank (`instrument-keys.ts:revolverTrancheId`, `KRLN-REVOLVER@BANK`);
a draw taps it at par at the margin it was struck at, and opens it — at the margin the bank
quotes now, for a year — only when none is live. Every draw path goes through it: stage 08's
liquidity shortfall and withdrawn refinancing (a tapped row is already in the ladder walk, an
opened one joins it), 07f's refused paper roll, 02b's overdraft conversion and the close's
sweep — which wrote a fresh facility per firm per week, each at its own struck margin, and fell
to a bare 350bp when it had no region. The five per-draw-per-week ids are deleted, and
`engine2/tranches.ts`'s 350bp fallback for a facility with no margin is a defect (every writer
states one). `test/tap.test.ts`: a second draw adds face and opens nothing; a bond tap is one
wire at the price given and touches no term. 16-ii (the bond tap in the primary) is inserted
after it. Gates green; no run.

**15b-iii — A PARTY LIVING ON ITS BANK IS A RUN.** The original list said "contract-break
streaks" and no object here is called a contract break; the non-performance this model records
at the close is the OVERDRAFT — a payer whose settled balance is below zero has spent its bank's
money, and `overdraft-sweep.ts` names and prices it (a firm's revolver draw, a fund's
prime-brokerage draw, a pool's SME facility draw). The sweep now records who it swept and for
how much, `banking.ts:rollOverdraftStreaks` rolls the runs (swept again: the run extends; not
swept: a clean close ends it) onto `GameState.overdraftStreaks` through the context, and
`news-derivation.ts` 7d tells the run — "KRLN closes a third week in overdraft: 5.0M this week,
12.0M over the run, converted to a facility draw at its house bank; cash …, coverage …" — the
week it becomes one (three closes) and each time it doubles (`overdraftRunIsTold`), urgent from
six, with the party, its region and its lender as refs and the run's draws as its size. With this
15b is done; the fourth item of the original list (damper binds) is moot, step 19 deletes the
damper. `test/overdraft-streak.test.ts`. Gates green; no run.

**15b-ii — AN AUCTION THAT CAME IN UNDER-SUBSCRIBED IS AN EVENT.** 07c and 07f withdrew what the
primary did not place and recorded nothing; the treasury's account ran lower in silence. The
region now keeps the week's auction rung by rung (`government.ts:PrimaryOfferingRecord` —
offered, placed, withdrawn, bond or bill — on `Region.lastAuction`, written by both stages through
`recordPrimaryOffering`, which opens a fresh record when the week turns); `auctionSummaryOf` gives
the coverage and the shortfalls largest first; `news-derivation.ts` 7c tells it above $1M
withdrawn — "USA auction placed 68% of 22.00B … Short: USA 4.5% 2037 3.00B of 8.00B … The
treasury's account stands at X, Y of it drawn from the central bank" — urgent past a quarter
withdrawn; the region's ladder view shows the last auction. The CP-roll story 07f already wrote is
on the derived feed's shape now (kind, refs to the firm, its region and its bank, the revolver as
its size, the cause), and says what matured, what the market took and what the line caught.
`test/auction-record.test.ts`. Gates green; no run.

**15b-i — A WORKOUT IS A STORY THAT DEVELOPS.** The derived feed told a default (1) and a close
(7) and nothing between, though a workout runs for weeks paying classes and selling slices. An
open estate now keeps its week (`domain/estate.ts:EstateWeek`, opened fresh by
`estate-resolution.ts` each pass: what the waterfall paid secured, unsecured and equity, the
stock and plant sold, the peers that bought), and `news-derivation.ts` 7b tells each week of it
above a $100k floor — "KRLN's estate pays 40M: 40M to secured lenders; 12M of plant went to
PEER; still owed 300M against 80M of assets left" — with the buyers as refs and paid + sold as
its size; a slice nobody bought says it was scrapped. The estate object shows its latest week.
`test/estate-week.test.ts`. 15b is split (15b-ii auctions, 15b-iii non-performance streaks —
the "contract-break" of the original list, which named no object here, is read as a party that
does not perform). Gates green; no run.

**15-v — NO INTERNING IN RENDER.** `statements.tsx` computed a firm's unpaid taxes by calling
`partyId(companyParty(c))` and `internReason(CORPORATE_TAX_REASON)` in render — both intern on
first sight, so looking at a statement could add a row to the engine's party and reason tables
(atlas E3, "no surface that changes the model"). `party.ts:partyIdOf` and
`settlement.ts:reasonIdOf` are the read-only lookups (nothing for the unseen, which owes nothing),
and `ui/world.ts:unpaidTaxesOf` is the typed selector the statement reads, like every other read
the surface takes. `test/settlement-lookups.test.ts` shows the lookups grow neither table. With
this, step 15 is done. Gates green; no run.

**15-iv — ONE CALENDAR.** `domain/calendar.ts` holds the epoch — week 0 is 1 January 2027, the
user's rule — with `dateOfWeek` and `yearOfWeek`; `ui/calendar.ts` keeps only the UI's spellings
of a date and reads the epoch from there; `engine/formatters.ts` loses `SIMULATION_START_DATE`
(5 January 2026, a year earlier, week 1), `getSimulationDate` and `yearOfSimulationWeek`, and its
news dates and quarter-filing labels read the same epoch; the four news timestamps and the two
traces read `dateOfWeek`/`yearOfWeek` directly. `formatBondName` — a second bond-name grammar,
`KRLN 4.75 '31`, that nothing called — is deleted (step 14 is the one). What remains different is
the WEEK, not the calendar: the UI formats the display week (the burn-in shifted off), the
engine's news timestamps the raw week; those timestamps are read by nothing on the surface.
Gates green; no run.

**15-iii — THE UI UNIT ERRORS.** Each at its cause. `commodity.tsx` and `fx.tsx` rendered
`change1W`, an ABSOLUTE move in the unit, through `pctLevel`; the move shown is now that over the
prior print, and the FX stat says the absolute move beside it. `inventoryLevelPct` is the one
field stored in percent points (0–100, `evolution.ts` clamps it so) and its two prints divide by a
hundred. `housingMarket.ownershipRatePct` was a FRACTION (0.62) named `…Pct`, and the one reader
that believed the name divided it by a hundred — renamed `ownershipRate` at its six sites and in
`housing.md`. `currentAccountPctGdp` was seeded 0, written by nothing and shown twice as a fact
(atlas E1): DELETED with its two prints; the macro page and the region statement show the trade
balance as a share of GDP, a read of real fills, and 37-BOP builds the current account as a read
(cross-border D1 re-cited to `tradeBalance`, still ❌). `all.tsx` guessed a rate's unit by
magnitude (`|v| ≤ 5 → %`) — the guess is gone, the depth floor prints the stored number. The six
engine formatters printed `$0.00`, `0.00%`, `0.0 bps`, `0.0x` and `100.00%` for a NaN or an
undefined; they print `—` (`formatters.ts:MISSING`, `test/formatters.test.ts`). Gates green; no
run.

**15-ii — PRICE AND DM/OAS SIDE BY SIDE IN EVERY FIXED-INCOME VIEW.** One read,
`credit-price.ts:paperQuoteOf`: the tranche's cleared price per unit of face off the one price
store, and what it implies — `rowSpreadBps` (an OAS on a bond, a discount margin on a floater)
against the issuer's region's curve for corporate paper; for a sovereign, which has no credit
spread here (bond.md N7.b), the YIELD — a bond's off its coupon schedule (`yieldFromPrice`), a
bill's off its discount to par over its remaining life (`billYieldFromPrice`). Unprinted paper
(a facility, a debut) quotes nothing and the views print a dash, never par. Shown in the tranche
object (a second stat row), its screener (two sortable columns), the ladder table and an
institution's holdings (a share shows neither). `test/paper-quote.test.ts`: a spread fed through
`priceFromSpreadBps` comes back to a hundredth of a basis point, a yield through `priceFromYield`
to a millionth. Gates green; no run.

**15-i — TRANCHES ARE SEARCHABLE, BY CLASS AND BY ISSUER.** `objects/tranche.tsx` was
`searchable: false` and listed nothing. Every live tranche now lists once per world (a memo the
search reads per keystroke), under its market name, with its issuer's ticker and name, its class
(`bond`, `subordinated bond`, `loan`, `facility`, `commercial paper`, `sovereign bond`, `bill`)
and its region as keywords, so `krln bonds` and `usa bills` find paper; a name typed exactly
resolves (`parse`); a class word alone (`bonds`, `loans`, `cp`, `facilities`, `sovereigns`,
`bills`) opens the screener on that class through the module's new `kindWords` contract
(`registry.ts`, read by `index.ts:kindOfWord`); and a tranche has peers — its issuer's ladder,
each class, all — with name, issuer, class, principal, rate and due columns (price and spread are
15-ii's). The search's per-kind cap of four is lifted for tranches as it is for firms and funds.
Gates green; no run.

**14 — NOMENCLATURE.** `domain/instruments.ts:instrumentDisplayName` is the one grammar (bond.md
N14, both types ✅): a bond is issuer + coupon + maturity (`KRLN 4.75% 2031`), a loan and a bank
facility issuer + margin + maturity (`KRLN L+350 2029`), a bill and commercial paper issuer +
tenor (`USA 3M bill`, `KRLN 3M CP`), a sovereign bond the same as a corporate. `engine/
instrument-name.ts:instrumentNameOf` is the one read of the store that feeds it — the row, the
issuer's ticker or (`entity-keys.ts:regionOfGovernmentEntity`) region, bill-or-bond. Used by the
tranche object (the id now shown once, as "id"), the ladder, every holders and desk list through
`book.tsx:instrumentName`, and the two traces that printed a tranche id (`[desk-prior]`,
`[paydown]`); the news names issuers and no paper today, so it has nothing to spell. The year is
the caller's calendar (`ui/calendar.ts:yearOfWeek` on the display week; `formatters.ts:
yearOfSimulationWeek` for a trace) because the two still differ by one — step 15 unifies them and
the name follows. `test/instrument-name.test.ts`. Gates green; no run.

**14-SHELL — THE SHELL, BEFORE THE VIEWS THAT SIT IN IT.** (user, 2026-09-04.) ONE cap for every
long list: `ui.tsx:Table` renders its first `TABLE_CAP` (50) rows and says so beneath them — "the
first 50 of N · show all", and the reverse once shown — and no caller slices: the screener's 400
and its hint, `book.tsx`'s 60, `index-object.tsx`'s 40, `contracts.tsx`'s 100 and `diag.tsx`'s 80
are deleted (five constants for one question, three of them silent truncations). And the keyboard
moves the bar, not the page: the viewport meta asks the keyboard to OVERLAY the page rather than
resize it (`interactive-widget=overlays-content`, so every browser reports it the way iOS does),
`Aurora.tsx:useVisualViewport` reads the visual viewport's scroll offset and the keyboard's height
off `window.visualViewport`'s own events, the fixed shell counter-moves by the offset (it holds
still on screen) and the command bar alone translates up by the keyboard's height. A browser
without `visualViewport` reports nothing and the shell is as it was. Gates green; no run, no
device.

**13f — AN ACCRUED COUPON IS AN ASSET OF EVERY HOLDER.** An institution's total assets — the one
read every sizing pass, the household residual and the UI take (`domain/institutions.ts:
institutionTotalAssetsLocal`, fed by `institutional-balance-sheet.ts` from the context and from a
closed state) — count the coupon accrued on its register rows and not yet paid by a date
(`bookAccruedLocal`), the same line a bank carries as `sovereignAccruedCouponLocal` and read off
the same ledger; the statement view shows it as "Accrued coupon" and sums it into total assets. An
institution that paid a seller's accrued at settlement (13b) had the cash gone and nothing standing
against it until the date, and every week it accrued was income on no sheet; now equity, the
residual of assets over the beneficiary claim, moves the week the coupon is earned. The seed's
pre-register read is untouched (nothing has accrued before the rows exist). `test/sovereign-
calendar.test.ts`. Gates green; no run.

**13e-ii — THE CENTRAL BANK JOINS THE CALENDAR.** `central-bank.ts` paid the central bank its
coupon WEEKLY, `face × coupon / 52` straight from the treasury and outside the holder walk — a
second convention for one thing, kept on the argument that the one holder that can never be short
of cash has no date. Deleted. Its rows accrue in `accrueSovereignHolders` like every holder's on
FACE; the date pays its book like every holder's (it was already in `registerBooks`); its coupon
income IS the accrual, written to `lastCouponIncomeLocal` by the calendar the way 02b writes the
interest on reserves it paid, and the remittance nets it unchanged; the accrued between the two is
a receivable on its asset side (`centralBankSovereignAssetsLocal` = the book at its mark + its
accrued), counted by M1, the snapshot, the FX revaluation and the trace. The treasury's payable
(`sovereignAccruedPayableLocal`) walks every row, so it counted the central bank's the moment the
rows accrued. The reserve drain nets out the leg paid to the central bank itself
(`lastCouponPaidLocal`), the one coupon cash that moves no bank's reserves. The seed opens the
book AGED: with no retained earnings the remittance has already paid the treasury the seeded
accrual's income, so what backs reserves and the treasury's account at the close is the book plus
its accrued, and `closeSeedMoney` sizes the book as the target over one plus the accrued per unit
of book. `test/sovereign-calendar.test.ts`. Gates green; no run.

**13e-i — THE DESK IS A HOLDER OF RECORD.** A bank's govvie desk inventory earned no coupon:
`accrueSovereignHolders` walked the institutions and the banks' own books and nothing else, so
the paper a market maker was long accrued nothing and the treasury never owed it. The desk's
GOV_BOND rows accrue on what they are long (a short accrues nothing; a bill has no coupon), the
bank books the income the week it is earned exactly as for its own book, the date pays the
desk's securities account off its rows like every other book's, and the bank's
`sovereignAccruedCouponLocal` reads both books. Gates green; no run.

**13-BOOK f5 — THE LAST GOODS STOCK OUTSIDE THE GOODS LEDGER HAS A HOLDER.**
`categoryDemand[c].inventoryLevelLocal` and its lag copy are deleted. A region's unsold stock
of a category is a GOOD row on the book of the region's SEGMENT of the industry that produces
it (the category's own name where no named industry does), in the good's units at the price
the category last cleared (`goods-ledger.ts:setSegmentStock` / `segmentStockUnits` /
`segmentStockLocal`). Stage 04 reads last week's stock off the row revalued at this week's
price, records what decayed, what was produced and what the industries drew as the pool's goods
flows, and writes what is left; the seed produces every category's opening stock (a tenth of a
year's demand, `stated.ts:SEED_OPENING_STOCK_SHARE`, one owner where three `× 0.10` stood);
`W4` counts the pool as a fourth part of the region's goods; the market view and the harness
read the row. This closes (f): the position book is lots with a basis, the goods are on it, the
accruals are on it, and nothing a firm or a region holds is a value with no holder and no unit.
Gates green; no run.

**13-BOOK f4b — SOVEREIGN ACCRUED INTEREST IS THE SAME COLUMN.** `GameState.
sovereignAccruedInterestLocal` (keyed `region|bond|party`) is deleted; a sovereign holder's
receivable is `accruedLocal` on its GOV_BOND row, on whichever book holds the bond — an
institution's, a bank's own, a desk's, a treasury's. The calendar accrues onto the rows it
walks, pays every register book's rows of a due bond to the book's own party and clears them,
reads the treasury's payable off every row of its paper (`sovereignAccruedPayableLocal`) and a
bank's `sovereignAccruedCouponLocal` off its own book (`bookAccruedLocal`); a resolution needs
no re-key; `O8`'s sovereign arm goes. Two things found writing it: an institution accrued on its
row's marked VALUE while a bank accrued on FACE (a coupon follows face; both do now), and a
fill against the clearing house must not carry the row's accrued with the wire — the house
holds no row and the book moves the accrued explicitly at the paper's per-face rate — so a
transfer carries it only between two books. This closes f4. Gates green; no run.

**13-BOOK f4a — CORPORATE ACCRUED INTEREST IS A COLUMN OF THE ROW IT ACCRUES ON.**
`GameState.holderAccruedInterestLocal` (≈105k keys, a nested map beside the register) is
deleted; the register row gained `accruedLocal` (`holdings.ts`), what the position has earned
and not been paid, in the instrument's money. The weekly accrual walk lands each holder's share
on its row (the column table now carries `registerRow`; a desk's share on its signed row); the
coupon date walks every register book and pays each row of a paying instrument to the book's
own party, clearing it; a transfer moves the balance pro rata with the units (`debitRow`
returns it, `creditRow` / `adjustDeskRow` take it — a resolution's desk assumption needs no
re-key any more); a redemption leaves it on the row, which stays on its book, emptied, until
it is paid (`keepsRow`, and the fold and the prune know it); the clearing write-back carries a
claimed row's balance onto its successor and keeps a sold-out position's row while it is owed;
the fills' moves (`moveCorporateAccrued`) wait on `ctx.pendingAccruedMoves` until the write-back
has made the rows they land on. `O8`'s corporate arm goes (the holder is the row's book). Reads:
`bookAccruedLocal`, `accruedRowOf`. Gates green; no run.

**13-BOOK f3 — THE GOODS LOTS ARE THE REGISTER'S LOTS.** `v2.lots` is deleted. A firm's
holding of one good is a row of kind GOOD on its own book (the sub-unit its instrument, the
firm's region its region; `GOOD` joins `InstrumentKind` with a `GOODS` class), and the row's
lots are the register's lots — the same columns a bond's or a share's live in, plus
`lotSeller`, who delivered each. `lots.ts` is the goods side of the one table: `pushLot` opens
the row on first touch and appends; `consumeFifo` draws one firm's good off its row;
`totalInputValueLocal`, `inputUnitsHeld`, `materializeInputInventory` walk the GOOD rows in
book order (the old first-touch order). The production kernels — the JS core, its C port and
the worker shards — address a chain by `(firm row × NSUB + sub)` as they always did: a pass
OPENS a slot view off the GOOD rows (`openGoodsPass`), runs, and CLOSES it (`closeGoodsPass`:
heads back onto the rows, units and value re-summed, dead lots recycled, an emptied row off its
book); the C kernel takes the same six columns and free head it always took, untouched. The
draw's float rules are verbatim. `O14` now covers every good too. This moves the numbers, as
(f)'s header said it would: a GOOD row's units and value are re-summed at each pass's close and
a firm's book order carries them. Gates green; no run.

**13-BOOK f2b — THE BASIS IS READ.** `holdings.ts:rowBasisLocal` (what a row cost — its lots'
units at the prices they arrived at), `rowHeldSinceWeek`, `bookBasisLocal`, `bookUnrealisedLocal`
(the mark less the cost) and `bookRealisedOf` — the register's own P&L record, per book and
money, cumulative since the seed, written by `debitRow` at every debit as the wire's proceeds
less the cost of the lots it consumed (`adjustLots` reports it): a sale's gain, a redemption's
pull to par, a write-off's loss. The institution's statement shows the three lines. This closes
`the-register.md` D4 and `corporate-credit.md` E4.a (the plan said `equity.md` E4.a; the node is
the credit tree's), and a capital-gains base exists for `the-treasury.md` C1 to tax. A desk's
row keeps its lots but its result stays on the bank's income statement (`adjustDeskRow` books
nothing here). This closes f2. Gates green; no run.

**13-BOOK f2a — THE DEBIT TAKES THE WIRE'S UNITS; THE FILL WIRES AND LOTS CARRY THE CLEARED
PRICE.** `debitRow` took the wire's VALUE and let the units follow in proportion, so a sale of
120 face at par out of a row marked at 0.99 took 121 face and no quantity a realised gain could
stand on existed. The units leave first now, oldest lot first, and the value that leaves is the
row's own mark on those units — what is left is still `units × mark`, and the gap between the
wire's proceeds and the mark-value that left is the sale's gain against the mark. A clearing
fill's wire and lot carry the price the book CLEARED (`holdings-store.ts:finalize` reads the
price store where the appended row is written at par; 07c's and 07f's bank and company fills
move at `clearedPriceOf`). This moves the numbers, as (f)'s header says it will: a fill values
at the cleared price at the site rather than at par until the mark. Gates green; no run.

**13-BOOK f1 — A POSITION IS A CHAIN OF LOTS, WRITERS FIRST.** The register gained a lot table
under its rows (`holdings.ts:lotHead/lotTail`, `lotUnits/lotPriceLocal/lotWeek/lotNext`): every
credit a ledger operation lands is a lot with the units it brought, the price a unit cost on
the wire and the journal's week; a debit consumes first-in-first-out (`adjustLots`); a desk's
short is a negative lot that a cover consumes; a fold joins two chains; a freed row frees its
lots; the clearing write-back carries a rebuilt position's lots onto the first appended row of
the same instrument and lands the fill's net as a lot at the fill's price, or consumes it
(`holdings-store.ts:finalize`); a mid-window delivery (`setRowShares`) does the same. The
row's `units` is the chain's sum, and `O14` checks every live row for it. Nothing reads the
chain yet: the basis, the realised gain and the holding period are f2, exactly as the plan's
writers-first rule says. Three things carried as they are and written into f2: a credit fill's
lot is at the wire's price, which is par (`clearedBookDelta`); `debitRow` takes units in
proportion to the value leaving rather than the units the wire names, so the lots follow the
row's own arithmetic; and a resolution's row moves re-lot at the transfer's mark. Every
register read is byte-identical. Gates green; no run.

**13-BOOK (e) — THE FOUR TAXONOMIES COLLAPSE INTO THE INDEX'S KIND.** `assets/index.ts:
InstrumentKind` is the one list — the register's nine kinds, the seven book kinds, the player's
two classes with no engine market — and every other union is a view of it: the wire's `AssetKind`
(the register's kinds plus money, a good, a house, a contract), the register's `HoldingType`
and its `ItemizedHoldingType` / `EstateClaimType` / `PrimaryOfferingType` views, the player's
`AssetType`, the index's own kind (re-exported). The registry answers every question for every
member (`ASSET_REGISTRY: Record<InstrumentKind, AssetModule>`) and the four per-kind boolean
maps beside it — ladder paper, vehicle claim, hedged as fixed income, carries rate duration —
are its columns; `holdingClassOf`, `isTrancheKind`, `heldInShares`, `isVehicleClaim` read it.
The two disagreements are gone with the lists: the player's `SOV_BOND` is `GOV_BOND` and its
`COMMODITY` is `COMMODITY_FUTURE`, in 12-portfolio, the carry calculator, the dealers, the news
shortcut and the trade's class map. Two absences found and closed on the way: `MMF_SHARE` was
never a register kind though the register holds it, and a private-equity interest moved by wire
as `CONTRACT` because the wire's list lacked it (`ASSET_KINDS` gains it; the wire world resolves
it against the index). Every register read is byte-identical; a PE interest's wires now carry
their own kind. Gates green; no run.

**13-BOOK d5c — POSTED INITIAL MARGIN IS A LIEN ON THE DEALER'S ACCOUNT.**
`FxDealerBook.initialMarginHeldLocal` is deleted. A client's margin is a lien on the dealer's
securities account in the contract's money (`accounts.ts:setAccountLien`), and the contract
ledger is its one writer: a strike raises it, the lifecycle's keep releases it with the contract,
a novation moves it with the dealer (`contract-ledger.ts:syncMarginLiens`, after every derivative
write). The sheet's `clientMarginLocal` is a read of the lien where the FX desk used to copy the
scalar. `initialMarginLocal` moved to the class registry so the ledger sizes the lien from the
profile the stage does. `O13` now checks every account lien against the claim that binds it —
stock-loan collateral and initial margin alike. `the-derivative-layer.md` D3 closes. This closes
d5 (d5a/b/c). Byte-identical. Gates green; no run.

**13-BOOK d5b — STOCK-LOAN CASH COLLATERAL IS A LIEN ON THE LENDER'S ACCOUNT.** The account
store gained one column (`world.ts:PersistentAccounts.lien`): the part of a row's balance the
party only holds. The loan book is its one writer — `publishSecurityLoanBook` sets every lender
the old or new book names to the collateral its open loans carry, per money, across every
region's book — and `settlement.ts:stockLoanCollateralHeldLocal` reads the lender's rows
(`accounts.ts:partyLienLocal`) instead of summing the book after the fact and memoising the sum
on the array. Its thirty-six callers (every spendable, budget and overdraft read) are unchanged.
`O13` checks lien = collateral per lender and currency. Byte-identical. Gates green; no run.

**13-BOOK d5a — A REPO PLEDGE IS A LIEN ON THE ROW IT BINDS.** The register gained one column
(`holdings.ts:lienUnits`): the units of a row under a lien. The repo book is its one writer —
`publishRepoBook` sets every borrower's liens to exactly what the new book pledges of each bond
(the matured contracts leave the book before the session asks what is free, so their liens come
off first) — and a resolution moves a lien with the rows it binds. A transfer that would leave
a row below its lien DEFECTS at the site (`debitRow`'s transfer arm: the auctions' floor at
pledged face is now guarded, not assumed); a retirement shrinks the lien to what is left and the
book's collateral call follows. Every unencumbered read asks the register
(`sovereign-register.ts:lienFaceByBond`): the repo session, 07c, 07f, the reconcile, the
harness. Deleted, each naming its read: the sheet's `repoEncumberedCollateralLocal` scalar and
its five carriers (`lienFaceLocal`), `collateralCapacityLocal` and the scalar fallback of
`unencumberedBorrowingCapacityLocal` (its callers all passed the per-bond map),
`collateral.ts:pledgedFaceByBond` (`repo.ts:encumberedFaceByBond`, which the publish uses to
write). `O12` checks lien = pledge per bank and bond. Byte-identical for every read. Gates
green; no run.

**13-BOOK d4c-vi — THE CAPITAL COMMITMENTS ARE ROWS OF THE CONTRACT STORE, AND ONE LIVENESS
CHECK WALKS EVERY KIND.** `peFund.lpCommitments` is deleted; `domain/commitment.ts:LpCommitment`
names the obligation. A commitment is a row of `engine2/obligations.ts` — the fund as A, the LP
as B, the commitment as the size, what it has drawn as the one column this kind adds, in the
fund's money (`COMMIT:<fund>:<lp>`, one row per pair). A fund's LPs are read as its rows
(`contract-ledger.ts:lpCommitmentsOf`, memoised on the kind's epoch; each object names its row),
a call and a distribution move the drawn column (`drawCommitment` / `returnCommitment`, now on the
world), and the seed's commitments ride a stash from the generator to `openSeededBooks`, where
they are struck by wire once every institution they name resolves. `O5` no longer reads the
derivatives alone: `liveObligationPartiesOf` hands it every live row of every kind as two
resolved parties, and a dead one is reported per kind — a firm in an open estate is alive to it,
as it is to the shipments' check. This closes d4 (the store holds all six kinds; the plan's d4
header goes with it). Byte-identical. Gates green; no run.

**13-BOOK d4c-v — THE TRADE INVOICES ARE ROWS OF THE CONTRACT STORE.** `GameState.tradeInvoices`
is deleted. An invoice is a row of `engine2/obligations.ts` — the seller as A, the buyer as B, the
face in the invoice currency as the size, the booked rate as the strike, the goods as the
reference (a fifth reference kind, the sub-unit), booked and due as the weeks — plus the one
column this kind adds, the buyer's region (the seller's is the row's). The store gained a
per-kind epoch beside its own: a book of ~170k invoices is memoised on ITS writes
(`contract-ledger.ts:tradeInvoicesOf`), not rebuilt because a derivative marked. An invoice has
no id: the object the book hands out names its row, and the settlement hands the survivors
back (`settleTradeInvoices(v2, stillOutstanding)`, the rest freed) the way the derivatives'
lifecycle does. Seven readers (the settlement, the estates' receivables, the FX-forward
exposures, `O8`, the lane view, the harness twice) read the store. Byte-identical. Gates green;
no run.

**13-BOOK d4c-iv — THE PRIME-BROKERAGE BOOK IS ROWS OF THE CONTRACT STORE.**
`Region.primeBrokerageBook` is deleted. A line is a row of `engine2/obligations.ts` — the broker
(its BANK party) as A, the fund as B, the drawn balance as the size, the financing rate as the
strike, the struck week — plus the one column this kind adds, the haircut. Read as the lines the
morning session, the two close sweeps, a resolution's novation and `O8` already walk
(`contract-ledger.ts:primeBrokerageBookOf`, memoised on the epoch), written back whole by
`publishPrimeBrokerageBook(v2, region, book)` at the four publish points, every party resolving,
the region's order kept. The two sweeps used to move `drawnLocal` on the region's own objects
before publishing; they move a COPY now, since the memo's objects are the store's view. Byte-
identical. Gates green; no run.

**13-BOOK d4c-iii — THE STOCK-LOAN BOOK IS ROWS OF THE CONTRACT STORE.** `Region.securityLoanBook`
is deleted. A stock loan is a row of `engine2/obligations.ts` — the lender as A, the borrower as B,
the collateral as the size, the fee as the strike, the shares as the units — with the three
columns this kind adds: the instrument on loan, the lender's position at strike (a recall is a
fall below it) and the recall week. Read as the loans the session and the settlement's collateral
read already walk (`contract-ledger.ts:securityLoanBookOf`, memoised on the epoch — the array
identity the settlement's own memo keys on is stable within an epoch), written back whole by
`publishSecurityLoanBook(v2, region, book)` at the session's four publish points, every party
resolving and the region's order kept. Byte-identical. Gates green; no run.

**13-BOOK d4c-ii — THE REPO BOOK IS ROWS OF THE CONTRACT STORE.** `Region.repoBook` is deleted.
A repo is a row of `engine2/obligations.ts` — the lender as party A, the borrowing bank as party
B, the principal as the size, the rate as the strike, the weeks, and the pledges as the row's own
list (`pledges`, the one column this kind adds). A region's book is read as the objects the session
and the domain helpers (`repoBorrowedLocal`, `srfBorrowedLocal`, `encumberedFaceByBond`,
`maturingAt`, …) already walk — `contract-ledger.ts:repoBookOf`, the rows materialized and
memoised on the store's epoch, so a week's many readers (02b, 07c and 07f per bank, stage 11, the
session, the reconcile, `O8`, the harness) share one copy — and written back whole through
`publishRepoBook(v2, region, book)`: every party resolves, a contract the store holds takes its
current terms (a call shrank it, a pledge was released, a resolution renamed its bank), a new one
gets a row, and the region's rows the book no longer names are freed, the region's order kept.
Stage 11's collateral pass, which shrank contracts in place and never wrote them anywhere, now
publishes the book it changed. Byte-identical. Gates green; no run.

**13-BOOK d4c-i — THE DERIVATIVES ARE ROWS OF THE CONTRACT STORE.** `engine2/obligations.ts` is
the one columnar store every bilateral obligation joins, one kind at a time, and the derivatives
are its first: kind and class refs, region, money, the two parties as interned party keys, size,
strike, units, the settled mark, the weeks, the typed reference and the term, chained per kind in
insertion order — the order every reader of the object book relied on. `GameState.derivativesBook`
is deleted; the store rides `v2` into next week and into every clone. The week's working copy is
the store materialized once on first touch (`contract-ledger.ts:derivativesBookOf`), each object
carrying its row: a strike resolves the parties, writes rows and appends to the copy; the
lifecycle's survivors are relinked (`keepDerivatives`, which writes back the marks they settled
and frees the rest); a novation re-points rows. The audits, the UI and the harness read
`derivativesOf(v2)` — the rows materialized — so no reader holds a second copy. The class
profiles still price the object they always priced (`materializeDerivative`, as a ladder row
materializes a `DebtTranche`); byte-identical, one materialization per week per reader class.
Gates green; no run.

**13-BOOK d4b — ONE DOOR FOR EVERY BILATERAL OBLIGATION.** `engine/ledger/contract-ledger.ts` is
the only writer of the six bilateral books, through named operations — `strikeDerivatives`,
`keepDerivatives`, `novateDerivatives`, `publishRepoBook`, `publishSecurityLoanBook`,
`publishPrimeBrokerageBook`, `bookTradeInvoices`, `settleTradeInvoices`, `drawCommitment`,
`returnCommitment` — and every party a written contract names resolves against the active wire
world at the write (`wire.ts:resolvePartyRef`, d2's resolver), so a contract on a party the entity
store does not hold defects at the site rather than surfacing in `O5`/`O8` a week later. The four
derivative adapters strike through it, the lifecycle keeps its survivors through it, a merger's
and a resolution's re-keys novate through it, the repo, stock-loan and prime-brokerage sessions
(and the close sweep's emergency draw) publish through it, stage 05 books the week's invoices and
the trade settlement writes what is still owed through it, and a capital call and a distribution
move a commitment through it. `check-hygiene.sh` refuses a bare assignment to any of the five
book fields outside the ledger. The books keep their shapes and the stages their arithmetic —
byte-identical; a resolution costs one bitmap read per party per publish. Gates green; no run.

**13-BOOK d4a — ONE PARTY UNION AND ONE KEY ACROSS THE BILATERAL BOOKS.** `repo.ts:RepoParty` is
`PartyOfKind<'BANK' | 'INSTITUTION' | 'CENTRAL_BANK'>` — the window's arm carries its region like
every other central-bank party, where it was a third variant `{ kind: 'CENTRAL_BANK' }` with the
book's own key (`repoPartyKey`, `'CB'`), the last party in a bilateral book that the ledger's
identity did not spell. `repoPartyKey` is deleted: a lender is compared as a party
(`party.ts:samePartyRef`, no key string), paid as one (`repoLenderParty` maps a bank to its
securities account and hands every other arm through), and checked for liveness as one (`O8`'s
repo arm no longer exempts the window). `derivativePartyKey` is documented as the ledger's
`partyKey` for the three arms a contract carries and a test holds the two equal. FOUND AND FIXED:
`O5`'s "contracts have two live parties" read a firm party by a `ticker` field it stopped carrying
at c-then-3b, so every derivative with a bank or company party counted as dead — it reads the
entity id now, which changes the O5 count (a measurement, step 38's). Byte-identical in every
number. The step was split here (d4b one door, d4c one store) once writing it showed the plan's
premise wrong — the derivatives book is an object array, not `v2.contracts`. Gates green; no run.

**13-BOOK dV — AN INDEX CONSTITUENT IS AN INSTRUMENT.** A credit index's constituents were
ISSUERS in a field called `instrumentId`, each weighted by the market value of everything it owed,
and the two credit trackers spread that weight over the issuer's paper by THIS WEEK'S values —
so a new issue diluted the standing paper's share of a frozen weight, and nothing could join an
index to the register or the price table. A constituent is one tranche now (`creditConstituents`:
every indexable rung of an eligible issuer, weighted by its principal at its cleared price; the
equity side is unchanged), the trackers hold each constituent at the weight the index struck and
take a member issuer's NEW issue at issue (the membership is the constituents' issuers, read off
the instrument index), and the level and basket read each constituent through the index
(`constituentValueLocal`: equity via `issuerIdOf` to market cap, a tranche via its row; a rung
that matured since the rebalance counts nothing until the next). `equityIssuerId`'s last read
leg in the index stage is gone. NUMBERS MOVE: a credit fund's demand lands on the paper the
index holds at frozen weights rather than on an issuer's paper at this week's split, and a
credit index's membership is a set of tranches rather than of borrowers — the finding
`indices.md` A1 recorded, closed; B4 is measurable now. Gates green; no run.

**13-BOOK dIV — THE ISSUED AMOUNT LIVES ON THE INDEX.** `Company.sharesOutstanding`,
`InstitutionalEntity.sharesOutstanding` (a constant nobody read) and `EtfFund.sharesOutstanding` are
deleted. The instrument index carries `issuedUnits` for the kinds no class store counts — a
company's shares, a fund's — and `instrument-ledger.ts:setIssuedUnits` is the one writer: a listing
creates the count and a take-private extinguishes it (pe-lifecycle), a buyback lowers it (stage
08's write-back, off the lane it read), a stock-paid merger mints onto it and a spin-off is
declared with its parent's count (10-mergers), an ETF's creations and redemptions move the fund's
(etf-flows). The reads are `issuedSharesOf`, `etfSharesOutstandingOf` and `marketCapAt` (price ×
the index's count); `marketCapOf` takes the count it multiplies, and at the SEED — before the index
is declared — the generator's count rides a stash (`stashSeedIssuedShares`, scaled with the firm,
consumed by `registerCompanyEquity` at `openSeededBooks`), which the seed's composite index, its
EV multiple and its opening allocation read. The company store's `sharesOutstanding` lane is a
DERIVED column like market cap, total debt and cash — re-derived by the sync mesh, never read off
an object — so stage 08's kernels are untouched. The four readers that took a `Company` and needed
its count take the count or a `capOf` reader instead (`companyFairValuePerShare`,
`decideCorporateFinancing`, `calculateCompositeIndices`, `publicComparableEvMultiple`). `O2`
compares the register's shares against the index's count — `the-register.md` B2 has a real issued
side. Byte-identical: every count is written where it was and read where it was, one owner.
Gates green; no run.

**13-BOOK dIII — THE ETF SHARE HAS ONE KEY, AND THE INDEX IS THE ONLY ISSUER READ.**
`etfShareInstrumentId` (the clearing book's `ETFSHARE-<fund>`) is deleted: `etf-flows.ts` clears a
fund's share under the key the register holds it by (`etfShareId`, the fund's own id, renamed from
`etfShareRegisterId` now that it is the one), so the book's instrument, its participants' positions
and the rows they settle to are one key. `etfShareFundId` — the fund behind a share as a cast of
the id — is deleted too: the fund is the instrument index's issuer (`instrumentIssuerOf`), read
where the ETF stage folds the holders' rows. With every instrument the register or a book names
declared, `issuerIdOf` has no fallback: an id the index does not hold defects as "nothing issued
it", and an instrument the index holds with no issuer (a swap tenor, a pair) defects as "nobody
issued it" — where it used to hand either back AS its own issuer. `O3` no longer exempts a fund
share by type: it asks whether the issuer the row's instrument names still exists, so a share of
a gone fund is the orphan A1.b asked it to find (`the-register.md` A1.b, F1, F1.a close). `W2`'s
trace nets a money or goods leg under its own asset rather than asking its issuer. Byte-identical
in every number; the ETF book's instrument id changes string, which nothing persists across a
run. Gates green; no run.

**13-BOOK dIIb — A CONTRACT'S REFERENCE IS TYPED BY CLASS.** `DerivativeContract.referenceId:
string` — an issuer's entity id (CDS), a commodity id (futures), a REGION (FX forward), `''` (swap),
discriminated by `classId` alone — is `reference: DerivativeReference`, one arm per class
(`ISSUER`/`COMMODITY`/`REGION`/`RATE`). The four writers state their arm; the class profiles ask for
their own through `issuerReferenceOf` / `commodityReferenceOf` / `regionReferenceOf` and defect on
any other; `DerivativeMarketView`'s credit accessors, the standing book's grade callback and
`pfeAddOnRateOf` take an `EntityId` and the three `asEntityId` casts in `buildDerivativeMarketView`
go; `O8`'s dead-reference arm reads the issuer arm; the UI reads the arm instead of probing the
commodity and company stores to guess a string's space. The standing book keys cover by
`referenceKeyOf` — the strings the field held — so every cover lookup answers as before.
`the-derivative-layer.md` A1 closes. Byte-identical. Gates green; no run.

**13-BOOK dII — THE MINTED IDS ARE DECLARED.** Every id `instrument-keys.ts` mints for a book
the adapters clear — a swap tenor (`IRS`), a single-name CDS (`CDS`), a spot pair (`FX_SPOT`, in
the quote currency), a cross-currency basis book (`XCS`, in the foreign currency), a futures
contract (`COMMODITY_FUTURE`, in the numéraire), the two repo books (`REPO`) and a name's
stock-borrow book (`SBL`) — is declared on the instrument index where the adapter builds it
(`instrument-ledger.ts:registerBook`: kind and money, NO issuer, idempotent since an adapter builds
its books every week), and a private-equity fund's interest is declared at the seed with the ETF
and money-market shares (`registerFundShares`). The wire's CONTRACT kind resolves against the
index like every other instrument kind, so `wire-world.ts` answers `undefined` for HOUSE alone.
The index's kind vocabulary is stated on `InstrumentKind`: the register's kinds plus the seven
book kinds — the one list slice (e) collapses the four taxonomies into. `issuerIdOf`'s fallback
stays until dIII deletes the ETF share's second key, the last id the register names that the
index does not; the contract's four-space `referenceId` is its own step, dIIb, inserted after
this one. Byte-identical. Gates green; no run.

**13-BOOK dI — THE INSTRUMENT INDEX EXISTS, AND CURRENCY LANDS ON IT.** `v2.instruments`
(`engine2/instruments.ts`) is one row per instrument the world has ISSUED, addressed by the intern
table's own `InstrRef`: its kind, its issuer (absent for an instrument nobody owes) and its money,
and nothing else — the terms stay in the class store, so the index copies no quantity and cannot
drift. `engine/ledger/instrument-ledger.ts:registerInstrument` is the one writer (hygiene guards
the import), idempotent, and a second declaration that disagrees defects at the site. Declared:
every ladder rung as `issueTranche` issues it — a sovereign's as `GOV_BOND`, which its wire now
also says instead of the `CORP_BOND` its flags read as (found here; the W audits key on no kind);
every company's equity at the seed and at the three births (spin-off, firm birth, FDI subsidiary),
beside `admitParty`; an ETF's and a money-market fund's shares at the seed. Read: `issuerIdOf`
asks the index first (its "an undeclared id is its own issuer" fallback stays until dII declares
the minted ids); `wire-world.ts` resolves EVERY instrument kind against the index, so the company
and fund sets it kept for equity and shares are gone and an undeclared equity is refused at the
wire; a coupon and a corporate action pay in the money the INSTRUMENT states
(`instrumentCurrencyOf`), not the issuer's home. `UnitOfMeasure` loses its money: `PAR_USD` →
`PAR`, `USD` → `MONEY`; which money is the index's column. Byte-identical in every number by
construction; the type intern table's numbering may differ (`EQUITY` is interned at the seed's
first declaration now), which no sum depends on. `test/instrument-index.test.ts` pins the
idempotence, the tranche declaration and the wire's refusal. Gates green; no run.

**13-BOOK d3f — THE ACCRUAL LEDGER'S DESK KEY IS THE BOOK.** `holderAccruedInterestLocal` keyed a
desk by its clearing SEAT (`<ticker>::DESK`) and everyone else by entity id — two id spaces in one
map, told apart by elimination (`dealerDeskTicker` said "not a desk") and crossed back to a party
through a ticker→id lookup in `holderPayee`. The key is the holder's REGISTER BOOK id now
(`holdings-ledger.ts:bookIdOfParty`, which `holderIdOf` is a case of; a desk's is `deskBookId`), the
same id its rows sit under: the three flow books write it through their existing seat→party
crossing (`accrualBookOf(participantId, partyOfParticipant)`), the corporate-action and coupon
passes look the payee up in what `registerBooks` states for that book, the desk-income roll-up is
by bank id, `O8`'s accrued-interest arm checks the bank a desk book names, and a resolution
re-keys `deskBookId(from) → deskBookId(to)`. `holderPayee`'s desk arm, its `bankIdOfTicker`
parameter and the two `companyByTicker` reads that fed it are gone. Byte-identical in every
number; the ledger's keys change shape, which a seed has none of. Gates green; no run.

**13-BOOK d3e — THE REGIONAL DESK ROLL-UPS DIE.** `bankingSector.corpBondDealerInventory`,
`sovBondDealerInventory` and `loanDealerInventory` are deleted, with `domain/dealer-desk.ts:
regionalDeskView`. They were a second representation of the desks' register rows: 02b rebuilt
them each week off the rows, the four flow books rewrote them after their fills (07c and 07f
partitioning one array between bills and bonds), `trade.ts` rebuilt two after a player fill, and
the seed's stock reconciliation read one — always empty at the seed. Their one decision-side
reader was the clearing engine's `priorDealerInventoryById` parameter, which `void`ed it: the
parameter is deleted from `clearFinancialAsset` and its fourteen callers, and
`applyDealerDeskFills` returns nothing (its regional view was only ever fed back into the arrays).
`regionalDeskViewOf` stays as the read for anything that wants a regional view. Byte-identical.
The seat-keyed accrual ledger the d3d entry named is its own step, d3f, inserted after this one.
Gates green; no run.

**13-BOOK d3d — THE DESKS' INVENTORIES ARE REGISTER ROWS.** `BankingSector.dealerDeskInventory`
is deleted, and with it the last holder class outside the register. A desk's paper is rows on the
bank's SECURITIES book (`holdings-ledger.ts:deskBookId`, the `BANK_SECURITIES` party; read through
`engine/desk-register.ts`), and the rows are SIGNED — a market maker is short when it has sold what
it did not have, so the ledger's desk arm (`adjustDeskRow`) adds and subtracts on one row per
instrument rather than debiting a long it does not hold. A book is a market name; the register
stores the KIND (`DESK_BOOK_KIND`), the two sovereign books share `GOV_BOND`, and a session tells
its bills from its bonds by the instruments it clears. Writers: every clearing book's
`applyDealerDeskFills` is a `transferHolding` per instrument against the house, re-marking the
prior rows with `markHolding` first; the lead's underwriting residual is the wire it always was,
with the sheet write beside it gone; stage 11's maturities `retireHolding` the desk's sovereign
rows with the treasury repaying face (and a desk SHORT the bucket pays it — a redemption it owed
used to be a negative payment); the paydowns, coupon splits and corporate actions read
`deskRowsOf`; a resolution moves the rows by wire (a short by the same |value| the other way);
the player's fills open their own journal and world in `trade.ts` and wire desk↔house, the
derivative and commodity exposure — a PFE use of the sheet, not a holding — staying as one scalar,
`deskDerivativesUseLocal`. Readers: the leverage denominator takes the bank's BOOK assets
(`bankBookAssetsLocal` = sovereign book at the mark + desks' gross) where it took the sovereign
book alone, the desks' capacity, the dealers' axes, the audits (`M5` signed, `O6` face), the
identity trace and the UI ask the register; `forEachSovereignPosition` is a filter over
`registerBooks` (class `DESK` off the `BANK_SECURITIES` payee) with no second store. Numbers
MOVE: a desk's sovereign paper matures out of a signed row in face rather than by a fraction of
its money; the register marks desk rows at `units × price` at the close; and a desk's rows are
in the register walks, so `O1`/`O6` see them by construction. Two leftovers, in §3 as d3e: the
three regional roll-ups 02b still rebuilds off `regionalDeskViewOf`, and the accrual pass keying
desks by seat through `holderPayee`. The player-trade journal is not audited by W1–W5 (opened
per trade, not per week): 37-SMALL. Gates green; no run.

**13-BOOK d3c — A COMPANY'S TREASURY BOOK IS REGISTER ROWS.** `Company.treasuryHoldings` is
deleted. A firm's own book (bills, since it bids for them in 07f) is rows on the entity's register
book under the `COMPANY` party, and the ledger's holder read learned the one rule that made this
safe to switch on: `holderIdOf` answers a `COMPANY` only when the instruction's instrument was
issued by SOMEBODY ELSE — the same party stands on the issuer side of every corporate-action,
merger-exchange and placement wire of its own equity and its own tranches, and an issuer placing
or retiring its paper holds nothing (`issuerIdOf` on the instrument decides; the seed passes no
instruction and seeds no company a book). `registerBooks` takes the companies whole now — a bank's
book paid as the bank, any other firm's as the company — so consolidation, the mark, the
corporate-action walk and the UI's holder list reach the treasuries with no third parameter. The
writers: `07f`'s treasury fills are `transferHolding` against the house in face under the
company's own party (it built the party from a ticker lookup that fell back to a TICKER AS AN ID
— gone), stage 11's maturities are `retireHolding` with the government repaying face, and stage
08's carry of the array (`companyUpdates.treasuryHoldings`, the week-update field) is deleted;
its treasury-holdings total reads `sovereignBookLocalOf`. Readers: `07c`'s reserve, `07f`'s bidder
sizing, `O1`'s credit arm (which walks every company's register book now, so a treasury that
ever held corporate paper would count) and the sovereign walk, which reports the class
`TREASURY` off the register and has TWO stores left: the register and the desks. Byte-identical
in state where the book is empty, which is everywhere at the seed; a treasury's bills are marked
`units × price` at the close from here on. Gates green; no run.

**13-BOOK d3b — THE BANKS' OWN SOVEREIGN BOOK IS REGISTER ROWS.** `BankingSector.
sovereignBondHoldingsByBond` and its stored total `sovereignBondHoldingsLocal` are deleted — from
the per-bank sheet and from the regional aggregate that shares the type. A bank's own book (its
liquidity buffer, not its desk) is rows on the entity's register book under the `BANK` party, the
party whose reserves buy it: `holderIdOf` answers `BANK`, `registerBooks` takes the banks beside the
institutions, the seed's allocation (OWN6) rides a stash and `openSeededBooks` issues it by wire,
and every writer is a ledger operation — `07c` and `07f` fills are `transferHolding` against the
house in face (a bond the engine reports no holding for is left standing; the Record rebuild used
to drop it with no wire), stage 11's maturities are `retireHolding` with the treasury repaying
FACE, `bill-accretion` marks the bills `units × price`, and a resolution or merger moves the failed
bank's rows to the assuming bank's book row by row (`bank-transfer.ts:absorbBankSheet`, which takes
the world and the two ids now). Every reader asks `sovereign-register.ts:bankSovereignPositions`,
`bankSovereignFaceByBond` or `bankSovereignBookLocal`; the sheet-total helpers that read the field
(`bankTotalAssetsLocal`, `leverageHeadroomLocal`, `sovereignBookCapacityLocal`,
`bankSheetAssetsLocal`, `planBankResolution`, `evolveBankingSector`, the identity trace's
`fieldsOf`/`residualOf`, repo's `collateralCapacityLocal`/`unencumberedByBond`) take the book as an
argument, 18 call sites; the regional yield reads `regionBankSovereignValueRecord` off the banks'
rows. THE PARTY CHANGES, DELIBERATELY: the own book's fills, its coupon accruals and its
redemptions named `BANK_SECURITIES` — the desk — so the bank's buffer and its trading book were one
party in the journal; they are `BANK` now, and a redemption lands in reserves rather than in the
securities account (money moves between two accounts of one bank; its sheet's total does not).
NUMBERS MOVE: the banks' bonds are marked at every close, their bills at `units × price`, and the
routing above. FOUND AND FIXED ON THE WAY, two seed defects of the same shape: `seedOpeningAccruals`
and `seedOpeningCreditPrices` ran inside `buildSeededGameState` against a store with no rows and no
ladders in it — every register holder opened at zero accrued and no seeded bond was priced, since
37-SEED — and both now run in `createInitialGameState` after `openSeededBooks`. `test/
bank-resolution.test.ts` states the sovereign book beside the sheet as it states cash. The sovereign
walk has three stores left: the register, the desks, the treasuries. Gates green; no run.

**13-BOOK d3a — THE CENTRAL BANK'S BOOK IS REGISTER ROWS.** `CentralBank.sovereignHoldingsByBond`
is deleted. The central bank is a register holder (`holdings-ledger.ts:holderIdOf` answers its
party; `registerBooks` lists one book per region, keyed by the party's own `partyKey`, so no third
id grammar), its opening book is issued by the treasury by wire at `openSeededBooks` from the
stash the seed's close sizes (`accounts.ts:stashSeedCentralBankBook`, the government ladder's
pattern), and every writer is a ledger operation: the two auctions' fills are `transferHolding`
from the house (`central-bank-demand.ts:bookCentralBankFills`, replacing a wire-only
`wireCentralBankFills` beside a Record write), stage 11's maturities are `retireHolding` to the
treasury, and `bill-accretion` marks the bills `units × price` (`markHolding`) so the remittance
reads the accretion the same week and the close's re-mark finds the rows already there. Every
reader asks `sovereign-register.ts:centralBankPositions` (face, per bond: the auction's
participant, the reinvestment spread, maturities, coupon income) or `centralBankBookLocal` (the
marked value: the balance sheet, `M1`, the trace, the harness, the UI); `centralBankAssetsLocal`
takes the book as an argument because `domain/` does not read the store. The walk in
`sovereign-register.ts` has four stores now. NUMBERS MOVE, as the step said they would: the
central bank's bonds are marked to the cleared price at every close where the Record held them at
the auction's face, and its bills at `units × price` rather than by the price's ratio — the
"marks meet the audit" finding, deliberately (rule 13). Found and fixed on the way: stage 11
repaid an INSTITUTION's matured sovereign at the row's marked VALUE times the fraction — face
only while the mark was par, so a bill bought at a discount was repaid at the discount — and it
pays face now (`the-register.md` E2). d3 is split into d3b–d3d above, one holder class per commit,
for the reason recorded there. Gates green; no run.

**13-BOOK d2 — THE WRITE THROWS.** `wire.ts` holds a `WireWorld` beside the journal — the
week's (or the seed's) entity arrays and the tranche store (`ledger/wire-world.ts`) — and refuses a
wire at the site: `wirePush` resolves both party ids against it (one byte read per party after its
first resolution, so the 145k money wires a week pay nothing measurable), and `wire()` resolves the
instrument — a tranche kind against the store's permanent id→issuer map (a row retired this week
is still moved to the paying agent after its ladder row is freed, so "ever issued" is the right
question), equity against the company table, a fund's shares against the fund entities, a good
against the sub-unit registry, money against the currency table. `issueTranche` is the one wire
that CREATES its instrument and says so (`creates: true`). HOUSE and CONTRACT answer `undefined`
and are left unchecked, stated, until slice (d)'s instrument index. A party born mid-week is
admitted before its first wire (`admitParty`) at the three birth sites — the pool's newborn, the
FDI subsidiary, the spin-off; `core.ts` installs the world beside the week's journal and
`openSeededBooks` installs the seed's, so the seed is the first world the write is checked against,
as planned. The plan's other clause — "a pure test over the seeded state joins §4's `npm test`" —
is DROPPED: §4's hygiene rule 4 forbids `createInitialGameState` in `test/` and rule 11 forbids the
run it would be; `test/seed-issuer.test.ts` now opens its ladder against a one-firm world instead,
which is the pure form. Two fallbacks that build a party from a ticker when the id lookup misses
(`07f:611`, `repo-clearing.ts:600`) are now the kind of thing that throws where it happens rather
than reaching O8. Byte-identical in state where no wire is refused; a refused wire is a defect
found, not a number moved. `tranches.ts:materializeGovLadder`'s note that `reg.govDebtTranches` is
"still the authority" was stale since 13-SOV row 2 and is corrected. Gates green; no run.

**13-BOOK d1b — THE LADDER MIRROR DIES TOO.** The same deletion on the tranche store, the week
after d1 found it there: `syncLadderRows`, `ensureLaddersSynced`, `assertLaddersInSync` and
`TRANCHE_SYNC_CHECK` are gone; `seedLadder` claims the chain through `tranches.ts:clearLadder` and
issues each rung by wire as before; `comp.debtTranches` is the week-end view `core.ts` materialises
and nothing in a week reads. Readers moved to the rows: `audit/names` N1's tranche-id test,
`audit/prices` P1's paper and facility spreads, and W3's two ladder sums (`snapshot.ts`) — which
§3.13-READ C5 had kept on the array on the argument that the array was the thing under test; that
was the mirror's argument, and with the array materialised from the rows the two reads were one
read, so W3 now tests the rows against the journal, two separate records, as W5 does. A newborn's
facility (`pe-lifecycle.ts:fundNewbornDebt`) opens its ladder in the store — empty, then the
facility by wire — instead of writing the array beside the wire, and the birth's opening-cash
carve reads the ladder off the store. `ALIAS_TRACE`, which checked whether two firms shared one
`debtTranches` array, is deleted: a per-firm view materialised each close cannot alias.
`openSeededMirrors` is `openSeededBooks` — it opens ladders and books by wire and mirrors nothing.
`test/seed-issuer.test.ts` opened its one-rung ladder through the mirror and now opens it by wire
in a week-0 journal of its own. Byte-identical in state. Gates green; no run.

**13-BOOK d1 — THE MIRROR DIES.** The register is one representation: the rows. `engine2/holdings.ts`
no longer calls itself a mirror — `syncBookRows`, `ensureBooksSynced`, `assertBooksInSync` and
`HOLDINGS_SYNC_CHECK` are deleted; `seedBook` claims the chain through `relinkBook` and issues each
opening row by wire as before. `entity.itemizedHoldings` is the week-end view `core.ts` materialises
for dirty books and nothing in a week reads: the clearing store builds its opening book from
`materializeBook` (so its index-for-row pairing is true by construction and the two defect guards
for a desync are gone), and the four in-week readers of the array read the rows —
`institutional-balance-sheet` (sovereign coupon income), `prime-brokerage` (the haircut),
`audit/prices` P5 and burn-in's row count; `MINT_STAGE_TRACE` read the array between stages,
where it cannot move, and now reads the rows. Both stage readers run before the clearing store
opens, so the rows they see are the opening book the array showed: byte-identical in state. The
seed-ordering worry the plan carried was not a defect — the week-0 sector projection ran on a
THROWAWAY host (an object with no world), so the mirror's catch-up there never touched the real
store and `openSeededMirrors` did open every book by wire — but that host had no accounts either,
so the sector's opening CASH projected as zero. The projection now runs after `openSeededMirrors`
on the state's own world (`projectSeededSectorViews`); week 0's `institutionalSector.cashLocal` and
`sectorEquityLocal` are the display change, and nothing in week 1 reads them before stage 11
rewrites them. Found and inserted: the LADDER has the identical mirror (d1b). `the-register` F3
now cites W5 (`auditWires` / `registerQtyByKind`), which is the check that survives. Gates green;
no run.

**13-BOOK d0 — ONE DOOR.** No file outside `engine/ledger/` and `engine2/` names a mutable store
handle now, and `check-hygiene.sh` fails the first that does — one guard over all five handles
rather than three lists of exemptions. The four outside writers became named operations of the
store they wrote: the seed's two direct balance sets are `accounts.ts:openSectorRow` (the household
line and each pool's row at a bank — the one operation that SETS a sector row, used by the seed's
close and nothing in a week); `05-unit-bidding`'s settle kernel, which held the contract book's
handle and wrote five columns itself, reads the book through the world's view and asks
`contracts.ts` for `ageContractWeek`, `restrikeContract`, `setContractBacklog`,
`applyContractDeposit` and `setContractShortWeeks` — each the statement it replaced, in the same
order; and `holdings-store`'s two column writes (a stock-loan delivery landing on a row, the
week-end fold of two rows of one instrument) are `holdings.ts:setRowShares` and `foldRowInto`.
The plan's count was off by two: `stage08-front` and `lots` are inside `engine2/`, so there were
four outside writers, not six. Byte-identical by construction (the same statements behind a name).
Gates green; no run.

**PLAN AND ATLAS REVIEW (2 of 2) — THE ATLAS CHECKS ITSELF, AND 47 FILES ARE RE-MARKED AGAINST WHAT
IS TRUE.** `check-atlas.sh` proves a citation RESOLVES; nothing proved a mark was TRUE, and the
review found the drift that gap allows: ~35 diff headings giving a node one mark over a row giving
it another, ~60 ⚠️/❌ rows no diff entry argued, tallies wrong in the file that lectured about
tallies, duplicate row ids (the-register A4 twice with different marks), a row with no tree node and
a tree node with no row, and 119 "Becomes a §3 step" sentences naming no step. `test/atlas-marks.
test.ts` now reads every tree against itself on every commit — tree ids ↔ rows, heading marks ↔
row marks, every ⚠️/❌ argued, tallies counted — and README owns the legend once (❌ on a FORBID,
evidence sub-rows as `<id> · text`, the unmarked titles, "a diff is not a log"). Every "Becomes a
§3 step" names its owner now. Prose caught up with the code the gate could not see: 348 `…USD`
names in tree prose are `…Local`, the ticker fields are ids, `DerivativeParty` is a view, every
credit book is `PRICE_LIKE` (the-clearing-engine D1.a ❌→⚠️ and re-argued), `comp.oasSpreadBps` is
gone from three diffs, four "Rule 28/29" citations are rules 7 and 12, bond.md's N9.b and its
missing N5 sub-rows, short-term-debt's stale "⚠️ D1/D2/D4" beside its own "✅ CLOSED" section, and
corporate-credit's "still open after row 1" beside row 4. Five session-narrative entries in
money-and-settlement collapsed to one closed entry with §9 pointers; private-equity C5 the same;
sovereign-credit's E1.a entry moved below its own tally and E1.a joined the tree. Re-marks: the-seed
A2 and C3 ✅ (§9.37-SEED closed them and the tree never heard), indices A2 ✅, the-derivative-layer
A1 ⚠️, the-register A1.b ⚠️, commodities-spot D2/D2.a/F2 ❌ (the diff had argued absence over ⚠️
rows), the-clearing-engine B5 ✅. Gates green, 297 tests; no run.

**PLAN AND ATLAS REVIEW (1 of 2) — THE BOOK REORDERED, EIGHT UN-HOMED FINDINGS INSERTED, AND `tsc`
WAS RED.** The user asked whether 13-BOOK was being built the smart way. It was not, in order:
twelve identity-plumbing commits had left the user's sentence — one door, violations throw at the
site — false in four places (the register is still a synced MIRROR of `itemizedHoldings`; five
mutable handles are imported by fourteen files; `wire()` resolves neither party nor instrument;
the sovereign, treasury and desk books are outside the register), all four sequenced BEHIND three
large refactors. Step 13's open slices are reordered enforcement-first (d0 one door, d1 the mirror
dies, d2 the write throws, d3 the outside books come in), (d4) one contract store for every
bilateral obligation and (d5) liens on lots are added, and the cross-table check is restated as an
at-write resolve rather than a gate that would need a run. PART VII gains 37-LOANBOOK,
37-OVERDRAFT (the user's own FORBID, ❌ in four trees, owned by no step), 37-OPENFUND, 37-VIEW,
37-FIRMCOST, 37-BIRTH, 37-SECURITISE and 37-EMPLOYMENT, each at its dependency position, and
37-SMALL loses two items §9.13-BILL had already closed. Plan corrections: nineteen rules, 699
`§7.N` citations, §8 is pointers not an index, file order is the order (stated at §3's head),
rule 14 names no branch, §9 is one ENTRY newest-first and its one out-of-order entry is moved.
`UNMAPPED` listed seven files the dead-file sweep deleted and one a tree cites — pruned, and
`check-atlas.sh` now fails both cases. Four `…USD` names 13c-RENAME missed are `…Local`.
**And the first gate was red at HEAD**: `npx tsc --noEmit` reported 27 errors in
`scripts/harness.ts`, every one a ticker the c-then-3b renames left behind — the three commits that
claimed five green gates ran the typecheck on `src` alone. Fixed by name, no casts. Gates green;
no run. Part 2 is the atlas sweep.

**13-BOOK slice (c-then-4) — `O8` WALKS EVERY PARTY-KEYED STORE, AND IT WAS READING THE ONE IT
HAD WRONG.** `O8`'s party arm checked the derivatives book alone — `the-register` D2 recorded that
as why the seeded-issuer defect went unseen — and after (c-then-3b) it checked it wrongly: it read
`p.ticker` off arms that no longer carry one, through a structural cast `{ kind; ticker?; id? }`
the compiler could not see into, so every firm party in the book would have counted as dead the
next time the audit ran. Fourth instance of the slice's one lesson: a cast or an unbranded
re-declaration is where a brand stops.

One resolver now. A `PartyRef` is a view of the entity store, so `partyExists` is one lookup per
arm — five entity arms against `companyById`/`institutionById`, five region arms against
`REGION_IDS` — and it is walked over **every store that names a party**: derivative contracts,
repo borrowers and lenders, prime-brokerage brokers and funds, estate claim holders, invoice buyers
and sellers, consignment buyers and carriers, the corporate accrual ledger (whose holder key is
two spaces by design — an entity id or a desk seat, resolved through `dealerDeskTicker` as
`holderPayee` does), the sovereign accrual ledger (`partyFromKey` on the key's tail), and the
account store's own interned party table. One finding line per store, because a dead party in a
repo contract and one in an accrual ledger are different failures with different owners. The
account-store arm is the one that fires on a re-key that missed the ledger — the failure
`rekeyBankLinks` exists to prevent, now with a check behind it.

Closes (c). 1 source file, +78 −8. Atlas: `the-register` D2's "nothing was looking" annotated with what
looks now. Gates green (150 tests); no run.

**13-BOOK slice (c-then-3b, CLOSED) — `PartyRef` IS A VIEW OF THE ENTITY STORE, AND THE ROAD
THERE RAN THROUGH A LIVE DEFECT OF MY OWN MAKING.** The four firm arms key by `EntityId` now; the
five entity arms share one key and `partyKey` writes it, so a payment's payer and a position's
`bookId` sit in one id space — the join the cross-table check needs and never had. Getting there
meant moving the eleven stored ticker references (`facilityBankTicker`, `brokerTicker`,
`borrowerTicker`, `buyerTicker`, `sellerTicker`, `carrierTicker`, `parentTicker`,
`acquiredByTicker`, plus the two already done and the tranche store's `bankRef` column) into the
entity space, with every reader keyed on them — `facilityBookOf`, `facilityRowsOf`,
`bankReservesOf`, `reserveRowOf`, `moveBankReserves`, `repoBorrowedLocal`, `encumberedFaceByBond`,
`lentByBroker`, the deposit-line readers, the freight and FX-forward desk maps. `issuerTicker`
survives on an offering as a display name beside `issuerId`.

**THE DEFECT.** Two commits ago `homeBankTicker` became `homeBankId`. `accounts.ts` carried
`type Depositor = { homeBankTicker?: string }` — a structural re-declaration of the domain field,
UNBRANDED — and its two comparisons, `c.homeBankId !== bankTicker`, compiled and went always-false.
**Every bank's corporate and institutional deposit line read zero from that commit until this
one**, silently; the banks' balance sheets would not have closed and no gate could say why. It is
the same hole as `asTicker` at a map boundary, seen from the other side: a brand protects a rename
exactly as far as the last unbranded re-declaration or unchecked cast on the path, and this slice
found three of each. `Depositor` is `{ homeBankId?: EntityId }`, and the rule it teaches is on the
type: a structural re-declaration of a domain field must carry the domain type or it is a hole in
the brand by construction.

**WHERE THE TWO SPACES STILL MEET, ALL NAMED.** The clearing books seat participants by keys that
embed a ticker (`participant-keys.ts`); `book-settlement.ts:bankIdOfTickerFor` is the one crossing
back, built once per stage and handed to `participantPartyOf` and `dealerDeskPartyOf`, and the
CDS and commodity books cross the same way at their seats. The goods book's `byKey` is two spaces
by design. The `companyUpdates` channel is keyed by ticker — its own field, marked at
`goods-arrival`. `entity-index.ts` keeps `companyByTicker` for those eleven readers, which is the
honest count of what is still addressed by ticker on purpose.

**THE MEASUREMENT THAT OPENED c-then, CLOSED.** `.ticker` references 845 → 468 and `ByTicker`
maps 155 → 129 across the four c-then-3b commits; the rest are display names and the goods book.
Six more full-array scans became lookups (freight's carrier per fill, prime brokerage's broker
per line, repo's borrower per contract, the trace's focus bank per dump). `PrimaryOffering` still
names its issuer twice (`issuerId` and `issuerTicker`) — one is a display name and the other the
key, and that is fine so long as nothing keys on the name.

84 files, +737 −637. Atlas: `money-and-settlement` C1.a/C4 closed, three citations re-pointed at
the renamed fields. Gates green (150 tests); no run.

**13-BOOK slice (c-then-3b, THE BANK LANE) — `asTicker` IS HOW A BRAND STOPS HELPING.** The
account store's dense bank lane was `Ticker[]`, so every tally read off it came out keyed by ticker
while every party pointing AT a bank named it by entity id. It holds the BANK now — `{ id, ticker }`,
the same "hand it the firm, not one of its names" move `rekeyBankLinks` made — so the four per-bank
tallies key by entity id and the translation table `bankIdxOf` needed is **gone rather than moved**.

**And the finding, which is a limit on the previous commit's own argument.** Both consumers of
those tallies did `map.get(asTicker(key))` — `settlement.ts:700` booking a bank's equity delta onto
its sheet, `core.ts:byRegion` attributing credit creation to a region. `asTicker` is `s as Ticker`
by construction, so when the key underneath changed from a ticker to an entity id **the compiler
had nothing to say**: both lookups would have missed every bank, silently, sending every equity
delta to `unresolvedLocal` and every credit tally to `bankTallyUnmappedLocal`. The previous commit's
claim — that branding made the rename safe — holds only up to the last unchecked cast on the path,
and these were two of them. Found by reading the consumers, not by the types. Both are lookups by
id now.

*(Also here, same shape: `ownership.ts:o5`'s `idOrTicker` fell back to a full `state.companies.find`
PER SHIPMENT after a ticker miss. The goods book's keys genuinely can be either space — that is
`05-unit-bidding`'s `byKey` seen from the audit — so both tries stay; the second is the index's
other half now.)*

4 files, +67 −54. Gates green (150 tests); no run.

**13-BOOK slice (c-then-3b, `homeBankId`) — BRANDING IS WHAT MADE A 218-SITE RENAME SAFE, AND
THIS IS THE PROOF.** The first of the eleven stored ticker cross-references: a party named its
HOUSE BANK by ticker while naming itself by entity id, so the two sides of one deposit row lived in
two id spaces. `leadBankTicker` came with it — the same allocator mints both.

**The proof.** `rekeyBankLinks` repoints every link naming a failed bank at the bank assuming it,
and it took two TICKERS. Rename the field to an id while both are `string` and
`if (c.homeBankTicker === from)` compiles, is always false, and **every client of a failed bank
silently keeps pointing at a dead bank** — the resolution stage would still run, still report, and
still do nothing. The compiler refused it. The function takes the two BANKS now, because the links
genuinely are not all in one space any more: `homeBankId` and `leadBankId` name a bank by entity id
while `brokerTicker` and the party keys still name it by ticker, and handing it the firms lets each
link be rekeyed in the space it is actually in. This is the argument for slices (a) and (c2) paying
for themselves, made concrete: the brand did not find a bug, it made a refactor that would have
introduced one impossible.

**Six full-array scans became lookups**, every one of the shape `updatedCompanies.find(b => b.ticker
=== c.homeBankTicker)`: once per overdrawn firm in `overdraft-sweep` and `02b`, once per newborn in
`pe-lifecycle`, once per fund in both prime-brokerage passes, once per offering in
`primary-settlement`. The last also carried a fourth instance of c-then-2's dead fold — a
`prevActiveFirms` rescan that could never find a firm the first scan had not.

**And the allocator's re-key is provably outcome-preserving**, not hopefully so: `chooseLeadBank`
ranks on three numbers and a tie-break hashed off the ISSUER's id, and reads no name at all — so
swapping `ticker` for `id` on a candidate cannot change which bank wins.

**What stayed in the ticker space on purpose**, marked at each site: `accounts.ts`'s dense bank lane
and the settlement report's per-bank maps. `bankIdxOf` is now the ONE place the two spaces meet,
which is the next commit rather than a translation scattered over every caller.

26 files, +214 −148; the ticker-only party sites fall 81 → 75. Atlas: `money-and-settlement` B1,
`prime-brokerage` and `fund-shares` re-cited. Gates green (150 tests); no run.

**13-BOOK slice (c-then-3a) — THERE WERE FOUR PARTY UNIONS, AND THE PLAN KNEW ABOUT TWO.** The
step's own text named `DerivativeParty` as the second. Reading found two more, and the pair of them
is the sharper finding: **`estate.ts:ClaimHolder` declares the SAME THREE ARMS as
`DerivativeParty`** — COMPANY, BANK, INSTITUTION, identically — so the model carried one type under
two names, and `repo.ts:RepoParty` a third overlapping set beside them. Between the four unions,
**three key functions in three formats**: `partyKey` and `derivativePartyKey` write
`INSTITUTION:<id>`, `repoPartyKey` writes `INST:<id>`. Nothing kept any of them in step — a new arm
had to be added four times or it silently was not, which is precisely what `PARTY_KINDS`'
compile-loud completeness check exists to prevent INSIDE `PartyRef` and could not see outside it.

**The cause is structural, and that is why it is fixable rather than a list of edits.** The union
lived in `engine/ledger/party.ts`, beside the dense-integer interning table — engine machinery — so
every domain module that had to name a party could not import it and wrote its own. `PartyRef` is
`domain/party.ts` now; the interning table stays in the ledger and re-exports it, so not one
importer moved. The other three are `Extract` views: `DerivativeParty` and `ClaimHolder` are both
`CounterpartyRef` (the three arms a party can be FACED as), and `RepoParty`'s central-bank arm is
the one genuine variant — it carries no region because `reg.repoBook` is per region, so
`repoPartyKey`'s `'CB'` is unambiguous within the book a contract sits in. Checked at
`repo-clearing.ts:379,814` rather than assumed; had the book been global, `'CB'` would have summed
four central banks into one.

**AND THE MEASUREMENT (c-then-3b), WHICH IS THE POINT OF THIS COMMIT.** `{ kind: 'COMPANY', ticker:
… }` and its three siblings were written by hand **204 times**. They now go through eight
constructors, and the split of which constructor is the size of the remaining job: **123 sites hold
the entity** and pass it, and a change of key leaves them untouched; **81 hold only a bare ticker**
and are exactly the sites that must be given a way to name the firm. `grep -c PartyOfTicker` is
that number, in 28 files — the same idiom `equityInstrumentId` uses to count its own crossing.
This is 13-READ's lesson applied a third time: give every writer a constructor first, and the
branding after it fits.

The whole pass cost 4 compiler errors across 204 rewritten sites, two of them real: a local
`bankParty` in `accounts.ts` shadowed the new import, and a test compared against an unbranded
ticker literal. 50 files, +286 −242. Gates green (150 tests); no run.

**13-BOOK slice (c-then-2) — THE OTHER TWENTY-FOUR, AND THE MIRROR THAT HAD TO BE HAND-REGISTERED
AT EVERY FIRM BIRTH.** The rest of the thirty builds, across twenty files, now go through the one
builder. What is LEFT behind afterwards is the right residue and worth naming, because it is the
test of whether the rule held: per-region VALUE maps (07e's prices, book equity, net investment
rate; the seed's issued-shares map) and two filtered CLAIMS (`08`'s `firmById` over
`prevActiveFirms`, `merger.ts`'s over `activeCompanies`). An index is a lookup; a filter is a
claim; a map of numbers is neither.

**`ctx.issuerTickerById` IS DELETED, AND IT WAS THE CLEAREST CASE FOR THE WHOLE STEP.** A
`Map<EntityId, Ticker>` built once at context creation — a mirror of one column of one store — with
three properties a mirror always ends up having. It could not see a firm born mid-week, so
`pe-lifecycle` carried an explicit `ctx.issuerTickerById?.set(c.id, c.ticker)` at the birth site
whose comment records what that cost before someone added it: *"a firm born mid-week was invisible
to every coupon and corporate-action payment that week — the money then flowed payer-less into the
unbacked ledger."* It was re-declared TWICE in `shared-helpers.ts` as `Map<string, string>`,
unbranded, and cast back with `as Ticker`. And it had exactly two readers. Both index
`ctx.updatedCompanies` now — which `core.ts:323` pushes the newborn onto in the same pass — so the
registration step is gone rather than moved, which is what deleting a mirror means (rule 4).

**THREE MORE FOUND BY READING.** (1) `ownership.ts` built a `regionById` map over every company on
every pass of `ownershipCoverage`, kept alive only by a `void regionById;` to silence the linter,
and read by nothing. (2) `audit/wires.ts` built the same two maps THREE times, two of them inside a
`forEach` so they were rebuilt per gap row; one lazy getter now, so the traces still pay nothing
when off. (3) `05-unit-bidding`'s `byKey` — the one map in the model that holds two id spaces on
purpose, because the goods book's buyer keys are either a ticker or an id — **resolved the
collision by walk order**. Its stated rule is "ids first, tickers after, so the ticker wins"; it
was implemented inside the walk as `if (!byTicker.has(asTicker(c.id)))`, a test against the tickers
seen SO FAR, so a colliding firm later in the walk was missed and the id won. Two passes now, and
the `asTicker(c.id)` cast — an entity id branded a ticker to compare across spaces — goes with it.

**AND ONE LIVE DEFECT, WHICH IS WHY THE POPULATIONS MATTER.** `sponsorPortfolioLocal` marks a PE
fund's portfolio, and its two callers passed two DIFFERENT populations: the engine
`prevActivePrivateFirms` (active, unlisted, **last week's objects**), the UI/harness read
`state.companies.filter(c => !c.isBankEntity)` (this week's, but including public and inactive
firms and excluding banks). Same fund, two NAVs, and the harness compares its own against the
engine's. **The engine's was the wrong one and it was stale**: a company taken private THIS week is
appended to `portfolioCompanyIds` and set `'PRIVATE'` in the same pass, but it was PUBLIC last
week, so it is not in `prevActivePrivateFirms` — and the brand-new LBO was marked at **zero** for
the rest of the week. Neither filter was doing any work (`portfolioCompanyIds` already names
exactly the right companies, and a portfolio company is private by construction), so both callers
pass the whole store now and the liveness test lives in one place. `private-equity` C5.

**BRANDING KEPT PAYING.** `CreditPriceWorld.issuerById` now takes an `EntityId` (its one
implementer answers out of the index, and `issuerIdOf` already returned one), which pulled
`issuerCreditPoints`/`issuerSpreadAt`/`issuerSpreadAtOnCurve` with it. `Company.managesEntityIds`
and `managedEntityIdsOf` are `EntityId[]`. `stage08-back`'s and `profiles/types`' `entityById` are
`ReadonlyMap<EntityId, …>`. And `index-calculation.ts:basketValueLocal` failed to compile — it
looks each index constituent up in a map keyed by COMPANY id, so **the EQUITY side reads
`IndexConstituent.instrumentId` as an issuer too**, not just the credit adapters. `indices` A1's
entry updated: all three readers of that field want a borrower.

24 files, +197 −98 (98 of the added lines are the reasoning above), 20 files now on the one
builder. Atlas: `money-and-settlement` C1.a, `private-equity` C5, `indices` A1. Gates green
(150 tests); no run.

**13-BOOK slice (c-then-1) — WHO A PARTY IS WAS ANSWERED IN THIRTY PLACES, AND ONE OF THEM WAS
WRITTEN TWICE IN THE SAME FILE.** The entity store is two arrays and every consumer that needed an
id or a ticker back built its own map over them: **thirty index builds**, and inside `settlement.ts`
the nine-case region switch behind the interbank leg and the per-book statement appeared **twice,
sixty lines apart** — `partyRegionOf` and an inline `regionOfParty`, identical (rule 4). One
`ledger/entity-index.ts` now: one shape, one builder, one `regionOfParty`, one `companyOfParty`,
and the memo policy stated once instead of thrice — memoised on the STATE in the audit, never in
the engine, because `08-company-fundamentals.ts:470` replaces companies in place at the same length
(rule 19's stale mirror; the audit's `WeakMap` stays where it was and only its SHAPE moved).

**THE INDEX CARRIES NO FILTER, AND THAT IS THE FIRST FINDING.** The four `bankByTicker` builds it
replaces did not agree on what a bank is — `isBankEntity` alone (the audit's O4, stage 08's lanes),
`bankBalanceSheet` alone (estate resolution), live-sheet-and-active (`banksOf`, in settlement) —
and all four were RIGHT for their site: an estate resolves a bank that has DIED, so a live filter
there would leave every bank estate unresolvable. Collapsing them would have picked one of three
answers silently. An index is a lookup; a filter is a claim, and each claim now sits at its own use
site where it can be read. Estate resolution's dropped a `!` on the way (`company.bankBalanceSheet!`
became a narrowing that the site does).

**BRANDING THE INDEX'S KEY THEN FOUND THREE MORE, EACH IN A DIFFERENT SYSTEM.** The old maps were
`Map<string, …>`, so anything at all could be looked up in them; `Map<EntityId, …>` refuses.
(1) `audit/ownership.ts:o3` was reading an `InstrumentId` out of the institution map — correct, and
it is the fund-share crossing, since the register keys a fund's shares by the FUND'S OWN ENTITY ID.
Named it (`etfShareFundId`, a no-op cast), which made the NEXT line legible: it exempts
`PE_FUND_INTEREST` and `ETF_SHARE` unconditionally, and since the line above already passes every
one whose fund is ALIVE, all that second line passes is **a share of a fund that no longer exists**
— the orphan O3 exists to find. `the-register` B1, left for slice (d).
(2) `DerivativeContract.referenceId` is typed `string` because it holds **four id spaces**,
discriminated by `classId` and nothing the compiler sees: an entity id from the CDS book, a
commodity id from the future, a REGION from the FX forward, `''` from the swap. The same shape as
`indices`' `instrumentId` holding ISSUERS (slice (a)). The three `DerivativeMarketView` accessors
are the CDS path; the cast is named there now. `the-derivative-layer` A1.
(3) `estate-resolution`'s `touchedEntityIds` was a `Set<string>` beside an `EntityId`-keyed map.

**AND ONE DEAD LOOP, DELETED AGAINST A READ RATHER THAN A RUN (rule 19).** `derivative-lifecycle`
built its maps and then walked `prevActivePrivateFirms` to fold in "companies the working copy
might not hold" — twice, in two functions. It holds all of them: `context.ts:432` opens the week as
`updatedCompanies: [...state.companies]`, every reassignment is a length-preserving `.map`, and
`prevActivePrivateFirms` is itself a `state.companies` filter (`context.ts:401`), so the
`if (!has(id))` guard could never fire. 07b and 07d carry the same loop; they are c-then-2's.
What it was guarding against is real — a CDS reference can be a private firm and most stages see
only the public `prevActiveFirms` — and the index is neither of those arrays: it is the whole store.

108 new lines (57 of them the reasoning above), **−28 net across `src`**, 5 files. Atlas:
`money-and-settlement` E4 and C1.a gain the new module, with the thirty builds written up there;
`the-register` and `the-derivative-layer` gain a diff entry each for findings (1) and (2). Gates
green (150 tests); no run.

**13-BOOK slice (c2c) — `Ticker` WAS MINTED IN SLICE (a) AND NEVER APPLIED, AND THAT IS WHY THE
FIRST ATTEMPT AT (c) FAILED.** The type existed with ZERO uses: `Company.ticker` was still
`string`, and `asTicker` was called nowhere. So the plan's own diagnosis — *"the compiler cannot
tell an ENTITY id from a PARTICIPANT id or from a REGION"* — was missing its largest term. The
ticker is the THIRD confusable space and by far the biggest: 844 references and 155 `ByTicker` maps.
While both identities were `string`, nothing could tell the compiler which of the two a site meant,
and `c-then`'s collapse of the ByTicker maps could not be attempted safely.

**It opened at 20 errors and peaked at 148.** That shape is the work: each source branded exposes
its consumers, until the front reaches the true PRODUCERS and collapses. The producers turned out
to be few — `generateUniqueTicker` (the mint: every ticker in the world is generated there or
cloned from a template that was), the intern table's `tickerOf` door, `chooseLeadBank` /
`mandateAllocator.pick`, and the participant-key readers. Branding those, plus ~40 fields and ~30
maps that key by ticker, took it to zero.

**PartyRef is now fully branded** — the four ticker arms and the entity arm — which is what
`c-then` needs before it can make it a VIEW of the entity store rather than a parallel union.

**Three things the brand made visible and each is written down at its site.** The treasury has NO
ticker: `governmentIssuer` puts its ENTITY id in the ticker field, and that stand-in is now stated
rather than implied by both being `string`. `chooseLeadBank` returns `''` for "nobody won the
mandate" — every caller tests it, so the empty ticker is admitted at the one site rather than the
return type widened to `Ticker | undefined`, which would change control flow everywhere. And the
double auction's keys are OPAQUE to it: it matches whatever strings the caller supplied, so 05 is
where they become tickers again, and the auction stays a generic matcher rather than learning
about firms.

Sixty `asTicker` admissions in all, of which 18 are test fixtures and 7 are the goods auction's
boundary. Zero errors, five gates green.

**13-BOOK slice (c2b) — THE INSTITUTION'S ID, `PartyRef`'S INSTITUTION ARM, AND FOUR SIBLING
UNIONS.** `InstitutionalEntity.id` alone opened at 11 errors. Branding `PartyRef`'s INSTITUTION arm
with it took that to 62 — which is the right size, because that arm is the ONE party kind keyed by
an entity id rather than a ticker, and it is what `c-then` ends by making `PartyRef` a VIEW of the
entity store instead of a parallel union. The four sibling unions went with it (`RepoParty`,
`DerivativeParty`, `LendingParty`, the estate's), because each declares itself structurally the
ledger's own arms and would otherwise have drifted from them the week after.

**Every fix was at a SOURCE, not a cast at a leaf.** Eleven fields that hold entity ids and were
still `string` are branded: a supply relationship's two ends, a PE sponsor's `portfolioCompanyIds`
and `lpCommitments[].lpEntityId`, an ETF's `sponsorEntityId`, a household's `etfShares[].fundId`, a
prime-brokerage line's `fundId`, a primary offering's `issuerId`, a firm's `ownership.peSponsorId`,
an estate's `companyId`, and `SecurityLoan.instrumentId` (as the INSTRUMENT it is). Roughly thirty
`Map<string, …>` declarations that key by holder or issuer say so now.

**THE THIRD AND FOURTH CROSSINGS SURFACED.** c2a found equity's; this found the FUND SHARE's — the
register keys an ETF's or a PE fund's interest by the fund ENTITY, so a row's instrument id is an
entity id there too (`etfShareFundId`). And the PE fund's was avoidable rather than intrinsic: its
ENTITY id was being minted by `instrument-keys.ts:peFundInterestId` — the constructor for the
instrument standing in for the constructor of the thing that ISSUES it. `peFundEntityId` is the
entity's now and the interest key derives from it.

**AND THE PARTICIPANT SPACE HELD.** The plan's warning — that the compiler cannot tell an entity id
from a participant id (`<ticker>::DESK`, `CDSDESK-`, `CONS-`) — is exactly what four sites hit, and
none of them got a brand. Three are narrowed by ELIMINATION at the point the desk arms have already
been excluded, and `securities-lending` and `irs` narrow through `isKnownEntity(bookEntityIds, id)`
— membership of the set the book itself admitted, which is a runtime check the code was already
doing, now spent as the compiler's evidence. `holderPayee` keeps a `string` parameter and says why:
its argument spans two id spaces and the entity arm is only reached once the desk arm is refused.

Sixteen unproven admissions in `src`, eight of them the constructors in `entity-keys.ts`. Zero
errors, five gates green, and the tree was red only between commits.

**13-BOOK slice (c2a) — `Company.id` IS AN `EntityId`, AND 13-READ IS WHY IT FIT.** The first
attempt at (c) branded `Company.id` and `InstitutionalEntity.id` together and reached ~70
outstanding errors across 30 files with the tree red throughout. This one, `Company.id` alone,
opened at **28 errors across 18 files** and closed with every site READ rather than pattern-matched
— because the ground was already cleared: D11 gave every writer of an entity id a named
constructor, D10 did the same for the party keys, and the ids the compiler now had to account for
were minted in five places instead of everywhere.

**Sixteen sites, and the compiler found the interesting ones.** Five errors were `InstrumentId`
flowing into an `EntityId` — every one of them THE EQUITY CROSSING, which slice (a) named in the
outbound direction (`equityInstrumentId`: a company's listed equity is keyed by the company). The
brand made the RETURN direction visible for the first time: four sites take an instrument id off a
register row and ask a company-keyed map about it. `equityIssuerId` names those, so
`grep -c equityIssuerId` now counts the return legs the way `equityInstrumentId` counts the
outbound ones — which is the size of what slice (e)'s one position book has to end.

**`entityOf` returns the brand now**, as `instrumentOf` already did — the entity intern table holds
entity ids by construction, so the admission belongs at the door rather than at each read. That one
change cleared six errors on its own. **And `issuerIdOf`'s FALLBACK became visible with it**: an id
the tranche store has never seen is handed back AS its own issuer. For a listed equity that is
correct and is the crossing; for anything else it is a lie the caller cannot detect, and it is
exactly what slice (d)'s instrument registry ends — with an index of instances, "an id nothing
issued" has an answer other than "itself". Written down at the site.

**Five more fields are branded because the compiler asked**: a supply relationship's two ends, a PE
sponsor's `portfolioCompanyIds`, a primary offering's `issuerId`, 07f's CP instrument issuer, and
the two credit books' `offeringsByIssuerId` key. `spinOffEntityId` joins `entity-keys.ts` — a
carve-out's id was still a template literal in `10-mergers`. Sixteen unproven admissions remain in
all, seven of them the constructors in `entity-keys.ts` itself, which is where an admission belongs.

**13-READ D13 (the safe half) — AND THE STEP'S OWN TEST: −164 CODE LINES.** The seed's three
house-bank passes share one rule now. It has a subtlety that is the reason its two halves cannot be
separated: `pick` CONSUMES the winner's free capacity, so the allocation depends on the order the
parties are handed to it, and the deposit total has to come from the same walk that made the
assignment. The seed's first copy had them apart — assign everybody in one loop, total them in a
second that re-tested a `homeBankTicker` the first had just set on every row — and the two agreed
only by accident. `assignHouseBanks` does both in one pass, and takes the late pass's
"only whoever is still unbanked" as a flag rather than a fourth spelling.

**THE TEST THIS STEP HAD TO PASS.** Net code lines must FALL. **They fell by 164** — 845 in, 1,009
out across 78 files, against the ~680 lines of vocabulary that slices (a) and (b) added. So the
vocabulary is a quarter repaid, and the part that matters more is that every remaining 13-BOOK
slice is now smaller: the id grammars have owners (`instrument-keys`, `entity-keys`,
`participant-keys`), the tranche-kind rule is one function on the row side as well as the object
side, "this region's live banks" is one predicate, and the two credit books share one demand build
instead of drifting apart in the dark.

**And what the step actually found.** Eleven live defects, of which the ones that moved real
numbers: an ACQUIRED bank still drawing SME facilities on a market share its acquirer had taken
over; `units` read two ways across eighteen sites, a share count against a market value on the same
equity row; 07e pricing EVERY listed company's equity on last week's leverage through a default
parameter; `irs.ts` mixing two epochs in one subtraction; the money fund quoting its yield off a
pre-trade book; the harness's O1 wrong on four counts against the audit it duplicated; P8 measuring
the sovereign carrying gap against a price it made up; 07d sizing leveraged loans as investment
grade; and a foreign-index ETF seated in credit auctions and given no demand.

**Three of the survey's own items were WRONG, and reading is what found that** — A4 was latent
rather than live (and the survey's own premise, that a bank could be private, is false), D9's
proposed `ctx` memo would have INSTALLED a stale mirror, and D13 is a reordering rather than a
collapse. Each is recorded where it was found rather than quietly dropped, which is the difference
between a work list and a wish list.

**13-READ D9 — THE PROPOSED FIX WAS THE DEFECT.** The survey said 38 lookup-map construction
sites, "home: memoised on `ctx`". Reading them: **most of the 38 are not duplicates at all** —
`billInstrumentById` over this session's instruments, `renamedByOld` over one merger's tranches,
`cpFaceById` over this week's paper — each a local index of a local list, which is what a lookup
map is for. And the two pathologies it named are inside `GOODS_TRACE` and `LADDER_TRACE` blocks:
env-gated diagnostics that run only when someone asks, where re-indexing five times costs nothing
anyone pays.

**And the proposed home is unsafe.** A cache keyed on the array's identity, invalidated when its
length changes, is the obvious `ctx` memo — and `08-company-fundamentals.ts:468` replaces elements
of `updatedCompanies` IN PLACE, at the same index and the same length. A memo keyed that way hands
back LAST WEEK'S company object for a live ticker: the stale-mirror failure rule 19 exists to name,
installed by the tidy-up meant to remove it. Making it safe needs an explicit invalidation call at
every such writer — a new invariant of exactly the kind `bumpRegister`'s comment warns about — and
what it would buy is two map builds per stage. Not worth an invariant, and the reasoning is written
at `settlement.ts:partyIndexOf` so the next reader does not re-propose it.

**What was real, and is done.** Three genuine repeats: `settlement.ts` built the same two party
indexes twice in ONE pass (`partyRegionOf` built them, and its only caller built them again eight
lines later); `pe-lifecycle.ts:callCapitalLocal` re-indexed every institution in the world on every
DEAL, from an index its caller had already built; and the audit built nine indexes over the same
two arrays across `o1`, `o3`, `o4` and `o5`. The first two are hoisted to one build per pass. The
audit's ARE memoised — on the state, which is safe there and nowhere else, because the audit runs
at the close over a world no stage is still writing.

**13-READ D5 (the collapse) — −129 CODE LINES, AND THE ATLAS GATE CAUGHT ME DOING IT.** With the
sub-IG factor restored the two credit demand builds were word-for-word equal, which is the state
§5 says to merge from, and `credit-demand.ts:buildCreditDemandParticipants` is now the one build
for the bond book and the loan book. The two differ only in the instrument they hold and only in
ways the build does not care about — it needs a face, an offering, a capital charge, a distressed
level and a way to turn a spread into a price, which `CreditDemandInstrument` states and a bond
and a loan both already satisfy.

**And `check-atlas.sh` refused the commit until the tree was right**, which is the counterpoint to
the hole part B found in it: `ratings-and-assessment.md` D1 cited
`07b-corporate-bond-clearing.ts:entitySubIGFactor`, the symbol moved, and the gate said so by name.
The node is re-cited at `credit-demand.ts:buildCreditDemandParticipants`, and its diff entry now
records that the loan book had lost the sleeve factor entirely — which is what that entry was
describing the effect of, one book short.

25 code lines in, 154 out.

**13-READ D12 — THE SEED'S DEMAND IDENTITY, WHICH ITS OWN COMMENT CALLED THE DEFECT.** C + I + G
split across the sub-units, then the Leontief solve on top: written three times, and the file said
so — *"the reason the same fix has to be made three times is itself the defect"*. It had already
cost: the intermediate-demand solve was added to two of the three and MISSED on the middle one,
which is the copy that overwrites the others, so the model ran on final demand only regardless and
sized every USA firm against a 1,481B market it then replaced with 567B.

`seedDemandFromCIG` is the two seed copies now, and it states the two terms that are easy to lose:
investment goes where capex is ACTUALLY spent (the capital-goods basket) rather than spread over
every corporate-bought good, and a corporate purchase of a non-capital good is INTERMEDIATE demand
which the solve produces from the recipes — put in final demand as well it is counted twice from
the other side. The weekly rebuild in `03-category-demand.ts` stays its own code: it reads each
firm's REAL capex rather than a share of GDP, which is a different input and not a copy.

**And D13 is NOT what the survey assumed** — found by reading it while here, and re-scoped in §3
rather than attempted. The seed's three house-bank passes are not equivalent copies: each feeds
`applyBankFundingSplit` in its own scope, and the seed steps between them run against banks that
must already carry what the pass before them placed. "One pass at the end" means moving the
funding-split application, not deleting two loops.

**13-READ D10+D11 — A KEY WHOSE FAILURE MODE IS A PLAUSIBLE NUMBER.** Ten sites built a
derivative party key with a template literal — `` `BANK:${ticker}` ``, `` `COMPANY:${ticker}` ``,
`` `INSTITUTION:${entity.id}` `` — instead of calling `derivativePartyKey`. Every one of them was
asking the standing book **how much cover this party already has**, and the standing book answers
a key it does not recognise with ZERO rather than an error. So one character wrong in any of the
ten reads as "this party has hedged nothing", and the party hedges again on top of what it already
holds — silently, and every week. `bankPartyKey`, `companyPartyKey` and `institutionPartyKey` are
the constructors now. (`domain/repo.ts` keeps its own grammar deliberately: it spells the
institution arm `INST:` where the derivative book spells it `INSTITUTION:`, and they are keys into
two different books.)

`repoLenderParty` and `partyRegionOf` turn out to be single definitions with several CALLERS, not
copies — the survey miscounted them, and they are fine as they are. What was real in D10's last
clause is the **government issuer OBJECT**, written four times: the same `{ id, ticker, region,
kind }` literal calling `governmentEntityId(regionId)` TWICE inside each one, in the three stages
that retire sovereign paper and in the seed. Slice (c1) extracted the id and left the thing built
around it — which is what a constructor that makes half a value gets you. `governmentIssuer` makes
the whole one.

D11 is the rest of the entity id grammar: a named firm, a carve-out private firm, a carrier, a
region's money fund, an index's tracking fund. Each was a template literal in whichever file
created the entity, and each is a key into the register, the accounts and the party table — the
same argument that made the treasury's worth naming. `entity-keys.ts` holds all five.

**13-READ D7 — THE HARNESS RECONCILED A BANK THAT NO LONGER EXISTS.** `isActiveCompany` is one
line, and it was written out longhand six times — three in `src`, three in the harness — plus five
harness bank filters that spelled the whole "this region's live banks with a sheet" predicate by
hand, which `banksOf` had already replaced everywhere in `src` (D8). One of the harness copies
checked **no liveness at all**: the secured-borrowing reconciliation compared a bank's
`repoBorrowedLocal` against the repo contracts naming it, over every company with `isBankEntity`
and a sheet — so a bank the engine had already resolved or merged away had its STALE sheet
reconciled against a repo book it no longer owns, and the harness reported a violation against a
bank that does not exist. Every one of them reads `banksOf` or `isActiveCompany` now.

**13-READ D4 — THE FLOAT, TEN COPIES OF ONE SUM.** Every clearing book sets `tradableFloatLocal`
twice: once from the INSTITUTIONS' claimed rows before the desks are built, and again once the
desks exist, adding what they carry. The ORDER is the part that is not obvious and the reason all
ten copies exist in the shape they do — a desk is sized against the LIVE float, so leaving the
float at the whole outstanding until after the desk build hands every desk capacity against paper
that is not for sale, and a float of zero hands back no desk at all. Five books wrote both halves
themselves: ten copies of "sum positive positions by instrument, then assign".
`positionsByInstrument` and `setTradableFloat` are the two lines now, and the rule about ordering
is written down once beside them instead of paraphrased in five comments. 22 code lines out.

**13-READ D5 (the divergence) + D6 — TWO BOOKS HAD EACH LOST A RULE THE OTHER KEPT.**

**D5 — 07D SIZED A LEVERAGED LOAN AS IF IT WERE INVESTMENT GRADE.** 07b's demand build scales a
sub-investment-grade name by the holder's own `subInvestmentGradeSizeFactor` — the sleeve an
insurer or a pension fund is allowed to run in paper below BBB. 07d's build is 07b's word for
word MINUS that factor, in both places it appears (the cash-weight loop and the structural size).
So the same holder took a FULL structural position in a borrower's leveraged loan and a fractional
one in that same borrower's bond — the wrong way round, because the loan is the riskier of the two
by rating and the mandate binds harder there, not softer. 07d now computes `subIG` the same way
and applies the same factor. **The collapse of the two ~80-line builds is deliberately NOT in this
commit**: §5's sequencing lesson says make every writer maintain the rule while the copies are
still equal, and only then merge them. They are equal now, which is the state to collapse from.

**D6 — A FUND WAS SEATED IN AN AUCTION AND THEN GIVEN NOTHING TO DO.** Each credit book decides
twice, a hundred lines apart, which indexes it prices: once to pick the ETFs that get a SEAT, once
(`bookIndexIds`) to give them DEMAND. 07b's and 07d's two copies disagreed — the seat filter
matched on asset class alone, the demand list also required the index's REGION. A fund tracking a
foreign credit index was therefore admitted as a participant and handed no demand at all: seated,
counted in the book's entity set and its write-back, and mute. 07e had the region clause in both
places and was right. `bookIndexIdsOf` is the one predicate now, and `indexFundsSeatedIn` uses it.

One difference between the three is KEPT and named rather than quietly unified: whether a fund
domiciled in another region may bid in this book. 07e says yes, the credit books say no. That is a
real modelling question, not a drift, so `sameRegionOnly` is a parameter each book answers for
itself.

**13-READ D2+D3 — THE LARGEST VERBATIM BLOCK, AND THE ROW IT BUILDS.** Three books wrote the
"may only rewrite what it CLEARED" write-back loop word for word: fills out of the holdings
matrix, then every CLAIMED row the session did not price, carried forward. The rule it encodes is
§7.34's, and it is not obvious — two kinds of claimed row survive a session and both would
otherwise vanish with no cash leg: paper this book did not price (a claim on a tranche that has
retired, standing at whatever the borrower's cash could not reach), and every row of an entity
that got no seat at all, which sold nothing and must keep everything. Rebuilding a book from
fills alone is what deleted 26.6B of bank bills in week 1 the last time a stage did it. A rule
that subtle, written three times, is three chances to lose it. `writeBackClearedFills` in
`book-settlement.ts` states it once.

D3 goes with it because it is the same loop's inner line: the fill ROW, in PAR space — the row
carries the FACE and the cash leg paid the cleared price for it. `parHoldingRow` is now the one
builder, so when §3.13's item 4 finally lands the mark, there is one place that has to change
instead of eight. 07c's write-back stays where it is: it rebuilds a BANK'S SHEET rather than
register rows, which is a different shape and a different store.

Code lines 56 in, 62 out — the helper's own comment is longer than the block it replaced, because
the rule needed writing down properly once.

**13-READ D1 — THE PARTICIPANT ID GRAMMAR GETS AN OWNER.** A clearing book names its bidders by
string, and those strings encode WHO the bidder is. Six books each wrote the translation back to a
`PartyRef` themselves, and the bank arm had drifted three ways: 07c matched a Set of PLAIN
tickers; 07f's bill book matched a `BANK-` prefix and re-parsed it with a hardcoded `slice(5)`;
07b, 07d, 07e and 07f's CP book had no bank arm at all. The prefix itself was minted in two files
and parsed in three, with three spellings of "take off the prefix" — `slice(5)` once and
`replace('BANK-','')` twice — and the repo book's `INST-` seat had the same shape.

`domain/participant-keys.ts` owns the grammar now, the way `instrument-keys.ts` owns the
instrument id space, with a named constructor AND a named reader per kind: bank seat, treasury
seat, household seat, repo institution seat. `book-settlement.ts:participantPartyOf` composes them
into the one translation, and it offers EVERY arm to every caller unconditionally, because the
grammars are disjoint — a book whose auction never admits a company treasury simply never sees a
`TREASURY-` id, so the arm is inert rather than wrong. What a caller still names is the part that
is not grammar: which entity ids it admitted, which banks' desks it built, and 07c's own
convention of seating a bank under its bare ticker.

**13-READ C4+C5 — THE CHECKS THEMSELVES WERE RE-DERIVING WHAT THE BOOKS PRINTED.**

**C4 — P8 measured the carrying gap against a price it made up.** It discounted every sovereign
rung at the zero curve and compared face to that. Right when a sovereign had no price: the curve
was the only opinion there was. §9.13-SOV row 4 changed that — `07c:546` and `07f:512` write a
cleared price per bond — so the check that exists to catch rule 19's fourth failure mode was
committing it. And the two are not the same number: an auction clears where supply meets demand,
a fitted curve is a smooth through them, so the gap it reported for row 4 mixed the carrying
defect with the fit error and was wrong by that. It reads the print now, a rung with no print
contributes nothing (§3.21 — paper nobody traded has no market value to be carried away from),
and the message carries the COVERAGE so a shrinking gap can never be read as progress when it is
really a quiet book. Decided by reading; no run, which rule 11 forbids here.

**C5 — and the audit's own walks, with one exception that is the point.** `o1`, `o2` and `o3` read
`debtTranches` and `itemizedHoldings`; the audit runs at the close, after `core.ts:450` rebuilds
both, so they were correct — rule-4 duplicates rather than bugs, and each read the object mirror
of rows the same check's other side already walked. They read the stores now. `trancheKindOfRow`
moves out of `tranche-ledger.ts`'s private scope into `engine2/tranches.ts`, beside the flags it
reads, which is A11's collapse finished on the row side.

**`snapshot.ts:ladderUSDByKey` STAYS ON THE OBJECT ARRAY, and its docstring now says why.** W3
asks whether the ladder MIRROR's change between two weeks is exactly the issuers' wires. Read from
the store, it would compare the store against the store's own wires and pass by construction. A
check that cannot fail is not a check, and the mirror is the thing under test. This is the case
the plan flagged to read `wires.ts:71` for first, and reading it is what settled it.

**And the hygiene gate caught ME.** The first version of C5's ladder walk was a `switch` over
`trancheKindOfRow`, which took the literal-instrument-type ratchet from 49 to 51: one rule
collapsed, two literals added. It is a keyed lookup now, which states the mapping once and
compares nothing. Rule 1.12 — the cause was the switch, not the budget.

**13-READ C3 — AND IT FOUND THE COPY A6 MISSED.** `aggregateRegionalHoldings` inlined
`materializeBook` field for field, and had drifted from it on the one field where the two can
disagree: the store falls back from a NaN `units` through the SHARE COUNT and only then to the
money; this copy went straight to the money. So an equity row that never had its units written
reported a dollar figure in the regional view and a share count everywhere else. A6 collapsed
seventeen copies of that fallback and did not catch this one, because it aliases the store as
`Ha` rather than `H` — a pattern match found seventeen and a READ found the eighteenth, which is
§1.19's own point turned on the sweep that enforces it. It calls `materializeBook` now.

**13-READ C2 — THE STALENESS OUTLASTS THE HANDLE, AND THAT IS WHAT THE NOTE GOT WRONG.**
`context.ts` said entity `itemizedHoldings` arrays are stale week-start snapshots *"while
`holdingsStore` is set"* — between the store's build before 07b and its write-back after 07e. That
is not what happens. `finalizeHoldingsStore` drops the HANDLE; the only site that refreshes the
arrays is `core.ts:459`, at the very END of the week. So the arrays hold the week's OPENING
positions from stage 269 until the week closes, and a stage that waited for the handle to clear
before reading them read exactly the same stale data. The note is corrected, and it is now the
whole window it names.

Two stages were inside it. **`irs.ts` mixed the two epochs in ONE SUBTRACTION**: it summed the
rate-carrying paper off the array and subtracted it from `institutionTotalAssetsLocal`, which
reads the store — so every bond an entity bought or sold in the four credit books, ten to fourteen
stages earlier, presented as duration gap it had not opened, and the fund took a swap against it.
**And `money-market-fund` quoted its net yield at stage 391** off the bill book it held before 07f
traded bills at 273 — comfortably past the write-back, which is exactly the reading the old note
invited. Both walk rows now. `institutionBookLocal` grew an optional class filter so the slice
case has somewhere to go other than back to `.filter()` on the array.

The other two `itemizedHoldings` readers are FINE and stay: `institutional-income` runs at 265 and
`prime-brokerage` at 247, both before the store is built, where the array is the current book.

**13-READ C1 — SEVEN ENGINE READERS WERE PRICING ON LAST WEEK'S LEVERAGE.** `totalDebtOf` sums
`Company.debtTranches`, and `core.ts:450` rebuilds that array from the tranche store ONCE a week,
after every stage has run. So for the whole of a week it is the PREVIOUS week's ladder — and 07b
and 07d issue, retire and default paper at stages 270 and 272.

The worst of it was a DEFAULT PARAMETER. `companyBookEquityLocal` and `companyFairValuePerShare`
both defaulted `totalDebtLocal` to `totalDebtOf(comp)`, and three of their four callers took the
default: **07e priced every listed company's equity** on it (stage 282), **`securities-lending`
priced the whole borrow book** on it (280), and **`pe-lifecycle` struck its LBO takeout** on it.
Only `stage08-back` passed a fresh total. The parameter is required now, which is what stops the
next caller taking it back. With it: `pe-lifecycle`'s `equityValueLocal` (which read the array
FOUR LINES from a site that read the store for the same company), the EV-multiple screen, the
merger's debt-capacity test, and the household private-business equity line.

`publicComparableEvMultiple` gained a `debtOf` reader rather than a `v2`, because its two kinds of
caller have two different sources and BOTH ARE RIGHT: inside a week the ladder is the store; at
the seed it is the array, because `buildSeededGameState` runs before `openSeededMirrors` and the
store has no rows yet. Naming the read at the call site makes the seed's choice a decision instead
of the accident it was when both sides silently took the array. That is the whole of `totalDebtOf`
now — three seed callers, documented as such, and its docstring says so.

The three UI readers convert too: the views hold `ensureV2(world.state)` already.

**13-READ PART B — −188 LINES OF CODE THAT NOTHING COULD REACH, AND A TREE NODE THAT WAS RESTING
ON IT.**

**B1.** `HoldingsTable` carried two builders. `build()` read the `itemizedHoldings` object arrays
and maintained a by-instrument transpose; `buildFromRows` reads the persistent row mirror and
deliberately skips it — `rowsOfInstrument` THREW if asked for the transpose on the row path, and
said so in its own message. `build()`'s only entry point is `getHoldingsTable`, which checks
`ctx.v2`, a REQUIRED field of `WeeklyStepContext`: the row path was always taken. Gone with it:
`holdingAt` (the last reader that resolved a row back to a holding object), `holderStart`, the
`byInstrument` map, and the `rowInHolder`, `issuerRegion`, `shares` and `qtyLocal` columns — the
table's one weekly consumer reads `byType`, `typeRange`, `instrumentId`, `entityRow` and `units`,
and now that is all the class has.

**B2.** `RegisterIndex` was a second compressed-sparse-row grouping of the same register, built
from the same object arrays, grouped by the same types in the same order. `buildFromRows` produces
that grouping from the row mirror without touching an object, and NOTHING outside the file ever
took the index: `buildRegisterIndex`, `typeSlice`, `REGISTER_TYPES` and the `ctx.registerIndex`
slot had no consumers at all. `bumpRegister` stays — six stages import it — and now drops one
cache instead of two. §2's "register-index.ts is live" was true of `bumpRegister` only; corrected.

**B3.** `indexFundsForBook`'s `holdingsUsdOf` was optional, with the entity's own array as the
fallback. All three callers (07b, 07d, 07e) run inside the store window where that array is a
stale week-start snapshot, and all three already passed the reader. The parameter is required now.

**AND THE ATLAS NODE THIS EXPOSED.** `the-register.md` D2 — "who holds this instrument?" — read ✅
against `HoldingsTable`. That mark was resting on the unreachable builder: the one direction the
node names was answerable only by code nothing could call. It is ❌ now, and the entry says what
is true instead — the store indexes the HOLDER side (`H.head`/`H.next`, one chain per party) and
the instrument side has no index at all, so every caller that needs it scans the register. D2.a
falls to ⚠️ with it, cited at the chain walk. This is exactly the failure mode `CLAUDE.md` warns
about: `check-atlas.sh` proves a citation RESOLVES, and both citations did, so the gate was green
while the node was false.

**A hole in that gate, found in passing and INSERTED at §3 PART VIII rather than fixed here:**
`check-atlas.sh` resolves a `file:symbol` citation by searching the file's TEXT, so a citation is
satisfied by a mention in a COMMENT. Deleting `buildRegisterIndex` left the gate green because the
replacement file's own docstring names it while explaining that it is gone.

**13-READ A8..A11 — THE FIRST FALL: −81 LINES, AND THE HARNESS STOPS DISAGREEING WITH THE AUDIT.**

**A8, one tranche worth two numbers.** The player's fixed-rate corporate position marked itself by
round trip: `rowSpreadBps` is `spreadBpsFromPrice` OF the tranche's own cleared price, and feeding
that straight back into `priceCorporateBond` asks two functions that are not each other's inverse
to agree. They did not have to, so the register marked the tranche at the print and the player's
book marked it at a re-derivation of the print. It now reads the print, like the floating branch
beside it already did. `dv01` still comes from the analytic — a sensitivity is a derivative of the
price curve rather than a point on it — struck at the print's OWN spread, which is what makes it
the sensitivity OF the printed mark. The coupon fallback stays: paper the book has not printed
carries no view, and its own coupon is the fair rate.

**A9+A10+A11, one function.** `checkHoldingsLedgerConservation` in the harness was a second copy
of `audit/ownership.ts:o1` that had rotted apart from it on four counts, and every one made the
harness's answer the wrong one: it summed each row's MONEY where the audit reads its FACE (so
every basis point of spread reported as paper that does not exist, the moment credit stopped
printing at par); it added the register's `GOV_BOND` rows ON TOP OF the banks' own sovereign
books; it counted paper issued THIS week, which is still in the auction and is nobody's yet; and
it tested one side only, so "paper with no owner" could not fail. It had no `isBankFacility`
guard either, so drawn facilities landed in the corporate and loan buckets that O4 already tests
on the lender's book (A11) — and it open-coded the sovereign walk twice, reaching three of the
four stores a government holding sits in (A10). `auditWeek` has been running `o1` on every week of
every run the whole time, so the CHECK was never the harness's to make.

The fix is the shape rule 4 asks for: `o1`'s measurement is extracted as `ownershipCoverage`, `o1`
reports from it, and the harness keeps only the two instruments §8 names — `MINT_TRACE` and
`OWN_TRACE` — now reading that same measurement instead of a private walk that disagreed with it.
Both traces also measured money; both now measure face, because a trace that measures a different
quantity from the check it explains sends the reader after the spread instead of the defect.

**−81 lines, 96 in and 177 out.** Gates green.

**13-READ A5+A6+A7 — THREE READS THAT WENT ROUND THE SOURCE, AND ONE OF THEM WAS A THROW WAITING
FOR A GAP TO OPEN.** All three are rule 19, and only A6 was wrong on a number today.

**A5, the stock loan.** Four carried legs (fee, both variation-margin directions, collateral
returned) re-derived the money from `currencyOf(comp.region)` while `SecurityLoan.currency` sat on
the record §3.13c put it on. The strike was worse in a quieter way: the collateral payment said
`currencyOf(c.region)` and the record minted on the very next line said `currencyOf(regionId)` —
two spellings of one fact, equal only because `listed` filters on `c.region === regionId`. The loan
is now minted FIRST and every leg, at strike and for the rest of its life, reads `loan.currency`.
No value moves: the region filter made all five agree. It is the standing invitation that goes.

**A6, and this one is live.** `units` is NaN on a row nothing ever wrote it on (`freeRow` clears
it; a book synced from a holding that predates the field never sets it), and EIGHTEEN sites fell
back from that NaN in two different chains. The store's materializer fell back through `shares`
and only then to the money; the other seventeen went straight to the money. On an EQUITY row those
are not near each other — one is a share count, the other a market value — so a single row read
two ways gave a count at the store and a dollar figure at every stage, and whichever the caller
reached for is what the merger swap, the estate residue, the ETF creation basket and the register
consolidation then moved. `rowUnits` in `engine2/holdings.ts` is now the only reader, on the
store's chain, which is the correct one. Two of the eighteen spelled the fallback differently and
both are folded in: `holdings-ledger`'s accumulate read the row AFTER incrementing it and had to
unwind the addition (it now reads before), and its mark walk backfilled the NaN with the money
(it now backfills with the count). `shared-helpers`' own named copy is deleted into it.

**A7, a throw one map away.** 07b and 07d resolved a tranche's borrower through
`issuerIdOfInstrument`, built over the paper OFFERED this week — and `settleClearedBook` turns an
unknown issuer into a `defect()` on the accrued leg. `accruedOnFills` unions each participant's
PRIOR holdings with its new ones, so it can name paper this session never offered; that never
threw only because `accruedPerFaceById` is book-scoped too and returned 0 first. One map guarding
another map's gap. Both now read `issuerIdOf(ctx.v2, …)` — the tranche store, which is where the
fact lives and what 07f already did — and the two dead maps go with it (D9's first two sites).

Gates green, and this time verified: eslint is clean.

**13-READ A4 + D8 — AN ACQUIRED BANK WAS STILL LENDING, AND "THIS REGION'S LIVE BANKS" NOW HAS ONE
SPELLING.** The question "which banks are here, alive, and have a sheet" was asked at 33 sites in
five different ways — three different source arrays (`prevActiveFirms`, `updatedCompanies`,
`state.companies`), three spellings of liveness (`isActiveCompany`, `!isDefaulted`, none), and the
sheet check present or absent. A4's stated case (07f asking two ways, one region loop apart) turned
out to be LATENT: `bank-resolution` runs at stage 421, after every clearing book, and an LBO
explicitly refuses a bank, so `prevActiveFirms` and this week's live banks are the same set at 07x
time. The survey found the live one instead. `overdraft-sweep` runs at 406 and spelled liveness
`!isDefaulted`; `10-mergers` sets `mergerAcquired` at 380. An acquired bank was still being handed
its `bankMarketShare` of every SME facility draw — a share its acquirer had already taken over — so
the pools drew credit from a bank that no longer existed and the surviving banks were diluted by it.
One `banksOf(companies, region?)` in `domain/company.ts` now answers it, requiring the sheet: every
one of the four sites that omitted that check reached for the sheet on the very next line with `?.`
and scored the bank at zero. The audit's own fifth spelling (a local `banksOf` over `GameState`) is
deleted into it. THREE SITES ARE DELIBERATELY LEFT: `audit/money.ts:175` reads ALL banks precisely
to compare against the active-only read (its comment says so), and `accounts.ts:buildAccountMirror`
and `fx-revaluation`'s reserve sum must still see a bank between default and resolution, which is
holding real deposits and real reserves. `asRegionId` lands beside it — the UI's `ObjectRef` still
carries `id: string`, and three views knew more than the type did. Net +8 code lines: D8 is a
uniformity win, not a line win — 30 import lines pay for 26 shortened filters. The line fall this
step owes is in D2/D3/D4/D5/D6, which are verbatim blocks rather than one-liners. Gates green.
**And a correction: the eslint gate was RED at A2/A3** — four unused imports the two steps left
behind — and I reported it green. It is green here, and the four are gone.

**13-READ A3 — THE FIVE BOOKS NOW AGREE ABOUT WHEN A PRICE IS REAL.** §3.21: a book with nothing
to trade has no clearing level, and what comes back is the solver's bracket, so the instrument keeps
the price it had. The three credit books tested what was PLACED (`outcome.marketTakeLocal`); the two
sovereign books tested what was OFFERED (`primaryOfferingLocal`). The readings differ in exactly one
state — nobody holds it, it is on offer, and nobody bought — and that state IS the rule's own
definition of nothing to trade, so the offered reading contradicted the rule its comment cited and
deposited a bracket artifact as a sovereign price. Both sovereign books now read PLACED. Narrow by
construction (whenever any holder exists, both readings already agreed), and decided on the rule's
wording rather than on a measurement, which rule 11 forbids here. Gates green; no run.

**13-READ A2 — FOUR BUDGETS SPENT COLLATERAL THAT WAS NOT THEIRS.** `institutionSpendableLocal`
nets the stock-loan collateral an entity is only HOLDING; four sites re-derived the rule inline and
all four dropped that term. An LP could answer a capital call, and a hedge fund's overdraft could
look funded, with money belonging to whoever it borrowed the stock from. `pe-lifecycle`'s sponsor
copy also dropped the `max(0, …)` clamp, so a negative pending settlement handed `distributable` a
NEGATIVE budget — the case the paragraph directly above it says the block exists to abolish.

The four do not all want the same read, which is why they had drifted: two are BUDGETS and take the
clamped `institutionSpendableLocal`; `prime-brokerage` is an OVERDRAFT TEST and takes the signed
`institutionUnsettledLessCollateralLocal`, because the clamped form would report every fund as
solvent; and `fx-forward`'s `strikeFor` now takes the budget from its callers, since its two callers
read it from two different places and a company is never a stock borrower (`LendingParty` is
INSTITUTION-only). Naming which read each site wants is what stops the fourth copy coming back.
Gates green; no run.

**13-READ A1 — AND 07F HAD IT WORSE: A BILL IS DISCOUNT PAPER.** 07c's defect again, with a
mechanism that makes it systematic rather than occasional. 07f's `primaryOfferingLocal` subtracted
`tradableFloatLocal` — what the BIDDERS hold, at the MARK — from the ladder's FACE. A bill trades
below par every week of its life by construction, so the offering was overstated by the whole
discount on every bill, every week. Second and separately, a holder that was not a bidder counted as
nobody: `regionEntities` is filtered by mandate weight, so an institution holding this region's
bills under a zero weight fell out, and the household books are not in that book at all. Both
sovereign books now ask `forEachSovereignPosition`, which reports face across every store; the
central-bank carve-out (its book is not on offer on a no-order week) is preserved exactly. Atlas:
`sovereign-credit` E1.a CLOSES — the walk is one and both callers use it. Gates green; no run.

**13-BOOK — 07C OFFERED PAPER THAT WAS ALREADY HELD, and it is rule 19's first application.**
`sovereign-register.ts` exists because five places open-coded the walk over the stores that keep a
government bond. 07c held a SIXTH, and being a copy is not what made it matter — it had rotted
twice. It summed `quantityOrNotionalLocal`, the MARK, and subtracted it from `outstandingLocal`,
the ladder's FACE; since register-marking began pricing sovereign rows at their cleared print, mark
< face for any bond below par, so the shortfall was overstated by the whole discount. That
shortfall is not a diagnostic — 07c assigns it straight to `primaryOfferingLocal`, so **the
treasury re-offered paper somebody already held, every week, by the size of the discount on its own
curve**. It also read `e.itemizedHoldings` from inside the window `context.ts` states those arrays
are stale in. `sovereignHeldByBond` answers both: it returns `units` off the store, so the two
sides of the subtraction are the same quantity and the walk sees the week's real positions. Net
−9 lines. Atlas: `sovereign-credit` E1.a re-cited and written up; it stays `⚠️` because 07f's bill
book still computes `primaryOfferingLocal` from bidders alone, so a corporate treasury's bill
holding is still re-offered there — same shape, fix not yet made. Gates green; no run.

**13-BOOK slice (c1) — THE SEED WIRED EVERY CORPORATE BOND FROM A PARTY THAT DOES NOT EXIST.**
Going after the entity registry found the defect before it found the registry. The seed opens each
institution's book by wiring every holding FROM its issuer, and it found that issuer by looking the
row's `instrumentId` up in a map keyed by COMPANY id. True while a corporate bond's row named its
company; false since §9.13-CREDIT row 1, when those rows began naming a TRANCHE. `ACME-T1` is never
`USA_ACME`, so the lookup could not hit and **every seeded corporate-bond and leveraged-loan row was
issued from `{ INSTITUTION, id: '<trancheId>' }`** — a party with no entity behind it, interned into
the party table and wired from. Both seed paths held the rule, written out twice and identically,
including the comment asserting the part that had become false; they are one function now
(`holdings-ledger.ts:issuerOfHoldingRow`) that ASKS `issuerIdOf` rather than assuming, so a tranche
resolves to its issuer and anything else stays its own. `test/seed-issuer.test.ts` pins both halves
and was checked to fail without the fix.

Also: **the treasury's id existed in five places** — a private `govIssuerId` in the seed, a bare
template inside `materializeGovLadder`, and three identical `govIssuer` literals in the three stages
that retire sovereign paper. `domain/entity-keys.ts` is the one statement of it, and the home the
entity mints will use. **CORRECTION (same day):** that step landed FOUR of the five. The seed's own
`govIssuerId` survived — the edit's replace did not match and the commit claimed a deletion that had
not happened, because the claim was never checked against the file. It is deleted now, and the
check that would have caught it is the one this step should have run: `grep` for the shape, not for
the symbol.

**And what did NOT land, with the measurement.** Branding `Company.id` and `InstitutionalEntity.id`
was attempted and reverted at ~70 outstanding errors across 30 files. The reason is worth keeping:
the compiler cannot tell an ENTITY id from a clearing PARTICIPANT id (`DESK-<ticker>`) or from a
REGION, so a pattern-matched brand is a guess, and three automated passes each had to be partly
undone after branding a region, a company object and a participant as entities. A wrong brand is
worse than no brand — it is a lie the compiler then enforces. §3 now carries (c) split into c2a/b/c,
each small enough that every site is read. Gates green (150 tests); no run.

**13-BOOK — THE READ VIEW REACHES THE OTHER THREE STORES, AND MONEY WAS THE ONE MISSING IT.**
Inserted here (rule 10) rather than left to the end, because it is the user's own test of the step
— *"make it impossible for something to change an object or an entity outside of some clear
input/output layer... similar to how money already works"* — and an audit found money was the store
it was NOT true of. `v2.holdings`, `v2.tranches` and `v2.lots` had a `Readonly` view; `v2.accounts`,
`v2.prices` and `v2.contracts` were the raw mutable types, so any file in the model could write
`v2.accounts.balance[r] = x`, `v2.prices.byIdRef.set(...)` or a contract's price, and nothing would
notice. The exemplar was the exception.

`Readonly<Float64Array>` does refuse element assignment (TS2542) — checked, not assumed, because the
whole wall rests on it — so the three missing views were the fix, with `mutableAccounts`,
`mutablePrices` and `mutableContracts` beside their ledgers. A probe writing a balance, a currency
id, a register quantity, a ladder principal, the print table and a contract price is now rejected on
all six.

**What is left is written down rather than claimed closed.** The handles are exported, so the wall
has named doors and eleven files hold one. Eight are the stores' own modules and their ledgers.
Three are not: `05-unit-bidding` writes five contract-book columns (the escalation re-strike, the
backlog, the progress deposit), `holdings-store` writes six register columns, and the seed writes
balances directly. Each is now a NAMED handle at a commented site instead of an ordinary field
write, which is what makes the remaining three countable — and making the handles module-private is
exactly the work of moving those writes into the owning module. Gates green (145 tests); no run.

**13-BOOK slice (b) step three — SEVEN SPACES, SEVEN NUMBERINGS.** With every site already behind
a door, the split itself was fifteen functions: `internedStrings`/`internedIdByString` become
`refs.{instruments,entities,regions,types,tickers,accountKeys,partyKeys}`, each its own append-only
table, and `internString`/`stringRef` are deleted because nothing outside `world.ts` could still
reach them. A ref is now meaningless outside the space that minted it at RUNTIME as well as at
compile time.

Checked before doing it, because this renumbers and this repo has a measured case of renumbering
moving a value by 0.43B: that case was interning ON A READ PATH, which shifts ids mid-run while
rows already hold the old ones — not the absolute numbering. Nothing sorts by a ref (both
`sortIndexByKey` callers sort prices), Maps iterate by insertion order rather than key, no ref is
persisted anywhere (only UI workspace state reaches `localStorage`), and the one place a ref value
is arithmetic — `pairOf(t, i) = t·2²² + i` — stays valid because the split makes instrument refs
smaller, not larger. So no number should move, and the reasoning is written down rather than
assumed.

`test/ref-spaces.test.ts` (6 tests) holds what a type check cannot: the tables are independent, the
same string in two spaces is two refs with two meanings, interning in one space does not shift refs
already handed out in another, a read never appends, and `NO_REF` ≠ `ABSENT_REF`. Atlas:
`the-register` F1's keying half is closed — `refs.instruments.strings` IS the enumeration of every
instrument, which one table could not give and which slice (d) needs. Gates green (145 tests); no
run.

**13-BOOK slice (b) step two — THE INTERN TABLE GETS A DOOR, AND EVERYTHING USES IT.** Step one
typed the ref columns; 78 sites still reached straight past them into `internedStrings[ref]` and
`internedIdByString.get(s)`, and every one of those would have silently read the wrong table the
moment the numbering diverged. So they are routed first, while the table is still shared and
nothing can move: 57 decode sites became `typeOf` / `regionOf` / `instrumentOf` / `entityOf` /
`tickerOf` / `partyKeyOf` (a rename per space, same table, same string), and 21 lookups became
`typeRefOf` / `instrumentRefOf` / `tickerRefOf` / `regionRefOf`, their `=== undefined` guards
becoming `< 0`. Zero remain outside `world.ts`.

Three things it turned up. **`shared-helpers.ts` had ONE lookup helper serving two spaces** — a
type tag and an instrument id, combined into a pair key — which is precisely what the split exists
to stop; it is now two named lookups and a `pairOf` that says the composite is deliberate.
**`ReadonlyHoldingStore` and `ReadonlyTrancheStore` were demoting every ref column back to
`Int32Array`**, because `RefColumn<B>` is assignable to `Int32Array` and the mapped type's
`Int32Array` branch matched first — so the brand died on every read that went through the readonly
view, which is most of them. And **`10-mergers` twice built a ref from a company's ENTITY id and
compared it against `instrRef`** to find rows holding that company's equity: the equity crossing
again, working only because the two strings are equal, and now rejected by the compiler until it
says `equityInstrumentId`.

Also separated: `NO_REF` (-2, "this name was never interned") from `ABSENT_REF` (-1, "this row
names nothing"). They were the same integer, and the collision is unreachable only because freed
rows are unlinked from their chains — the kind of thing that stops being unreachable later, when a
missed lookup would equal a freed row and a walk would read it as real. Gates green; no run.

**13-BOOK slice (b) step one — EVERY REF COLUMN NAMES ITS SPACE, WITH THE NUMBERING UNTOUCHED.**
Nine columns index one intern table — `H.instrRef`, `H.typeRef`, `H.regionRef`, `TS.idRef`,
`TS.issuerRef`, `TS.bankRef`, `A.keyRef`, `T.supplierRef`, `T.customerRef` — so they are one
numbering and only their names kept them apart. `engine2/refs.ts` gives each a branded integer type
and, crucially, `RefColumn<B>`: dropping `Int32Array`'s numeric index signature and restating it as
`B` keeps the brand **across the subscript**, which a brand on the intern function alone does not —
it would die at the first read and every comparison downstream would be unchecked again.

Proven rather than asserted: a scratch file comparing a TYPE column against an `InstrRef`, writing
an `InstrRef` into the REGION column, decoding a `TypeRef` as an instrument, decoding the instrument
column as a type tag, and writing a bare number into a ref column was rejected on all five, with the
matching correct uses compiling in the same file. Every write now goes through a per-space door
(`internInstrument`, `internType`, `internRegion`, `internEntity`, `internTicker`, `internAccount`,
`internPartyKey`) and raw `internString` fell out of nine files that used to reach past it —
`ABSENT_REF` types the -1 sentinel as a member of every space at once, since a sentinel belongs to
none.

**Every door delegates to the same table, so every ref keeps the integer it has today and no number
can have moved.** That is the §5 sequencing rule and the reason this is two steps: the split that
renumbers comes second, once the compiler has already proved every site is in the right space.
Atlas: `the-register` F1 gains `refs.ts:RefColumn` beside `ids.ts:InstrumentId`, with what is still
false written up in that tree — the one table still holds ~15 type tags and 5 region codes among
thousands of instrument ids, so *"enumerate every instrument"* has no answer until step two. Gates
green; no run.

**13-BOOK slice (a) — THE ID SPACES BECOME TYPES, AND THE KEY GRAMMAR BECOMES ONE FILE.**
`domain/ids.ts` states the three spaces a string can name — `EntityId`, `InstrumentId`, `Ticker` —
as BRANDED strings: the same string at runtime (so `structuredClone` on the host state is
untouched and no number can move), a different type at compile time, so `Map<InstrumentId, X>.get(
someTicker)` stops compiling. Brands went on the KEYS and never on the fields, for the reason §3
gave: branding `Company.ticker` would light up 744 mostly-legitimate sites and say nothing.

Two facilities made the sweep converge instead of spreading. **One mint per source of ids**:
`instrumentIdAt(v2, r)` replaced 27 hand-written reads of a register row's instrument out of the
shared intern table, and `trancheIdOf(v2, r)` the 25 equivalent reads of a ladder row — one place
each for slice (b) to make true rather than 52 to find. And **one key grammar**:
`domain/instrument-keys.ts` holds a named constructor per instrument family (swap, CDS, FX spot and
basis, futures, ETF share, repo, and eight corporate-tranche shapes stage 08 and 10-mergers used to
build with backticks in place), each reproducing its old template byte for byte, because these keys
are PERSISTED and a changed key is a silent migration rather than a rename. `asInstrumentId` — the
unproven admission whose count is what is left — now appears once per FAMILY, not once per site.

The break-and-let-the-compiler-enumerate ran 17 → 170 errors at its widest and back to 0. Three
things it found that a reading would not have: **the ETF share has two keys** (the clearing book
prices `ETFSHARE-<fund>`, the register keys the fund's own entity id, and `banking.ts` has carried
that in a comment for the life of the field — recorded, deliberately not migrated, both
constructors now sit next to each other); a **plain object cannot carry a key brand** in
TypeScript, so `sovereignBondHoldingsByBond` and its two siblings keep `Record<string, …>` and the
brand lives on `instrumentEntries`, the one typed reader — which is itself the argument for slice
(f) replacing them with Maps; and `primaryTakes`'s two callbacks were named `issuerId` while being
handed the INSTRUMENT the deal listed under, true only for equity and never for a credit book.
And one thing slice (a) made QUIETER rather than louder, which is worth more than the three above:
branding `IndexConstituent.instrumentId` should have failed on the credit indexes, whose
constituents are ISSUERS. It did not, because slice (a)'s own `equityInstrumentId` launders a
company id into the instrument space — right for equity, wrong for IG/HY/LL, and the type is
satisfied either way. Written up at `indices.md` A1 rather than papered over; slice (d) decides it.

Atlas: `the-register` F1 moves off `issueTranche` onto `ids.ts:InstrumentId`, F1.a to `⚠️` with the
ETF split written up in §3 of that tree; `commodity-futures` C1.a follows `contractId` into the key
grammar; `indices` A1 to `⚠️` on `IndexConstituent` for the issuer/instrument conflation. Gates
green; no run.

**13-OUTSIDE a — ONE OWNER FOR "WHO HOLDS THIS BOND", BEFORE ANY STORE MOVES.** The step is to
put the banks' and the central bank's sovereign books in the register, and the first thing looking
at it found was that the step under-counted its own subject: a sovereign holding lives in FIVE
stores — the register, each bank's `sovereignBondHoldingsByBond`, each bank's desk inventory, the
central bank's book, and a company's `treasuryHoldings` — and **five places walked them by hand**.

They had already fallen out of step with each other, which is what a duplicated READ does:
`holdings-view` counted the banks and the central bank and not the desks; `O11` walked four stores
and not the treasuries; `O1` read three of them in three separate places; the UI's sovereign holder
list showed the INSTITUTIONS ALONE, so the view of who owns a government's debt omitted most of its
holders and gave no sign of it; and none of the five knew about the household books §9.13-EQUITY
had added a step earlier. `engine/sovereign-register.ts` is the one walk and those callers are
projections of it.

**It is deliberately not the migration.** §9.12's lesson is that the keying step worked *because*
the store and the read were separated FIRST and the key changed second, and rule 11 means this one
cannot be measured on the way. With the read owned, moving a store is a change in one function.
The seed keeps its own walk, and the reason is the moment rather than the shape: it runs before the
register exists. Atlas: sovereign-credit gains E1.a for the walk (⚠️ — it exists because there are
five stores, and 13-OUTSIDE is what removes them), counted at 68 rows. Gates green; no run.

**13-BILL — THE ACCRETION STOPS BEING COMPUTED AND STARTS BEING OBSERVED.** `bill-accretion`
grew a held bill toward face at `calculateNelsonSiegelZeroRate(yearsRemaining, yieldCurveParams)`
— THIS week's fitted curve, at a tenor nobody had traded — so a holder that bought a 52-week bill
at 5% accreted at 2% if the curve fell and 8% if it rose. That is `short-term-debt.md` E2 in one
line, and it broke the conservation the stage's own header is built on: the treasury pays
`face/(1+y₀·t)` and repays `face` while holders accumulate at `yₜ`, and the two agree only if
`y₀ = yₜ`. Nothing measured the gap.

The return is now a READ of the bill's own printed price (`07f` deposits it since §9.13-EQUITY),
and there is ONE OWNER per holder class: an institution's bills are rows with a quantity, so
`register-marking` marks them `units × price` at the close like every other row and this stage no
longer touches the register at all.

**It marks rather than locking the rate at purchase, and that is a decision.** `sovereign-credit.md`
F2 argued the opposite — *"a discount instrument's return is locked at purchase; that is the whole
of what a discount is"* — which is the AMORTISED-COST convention, and this model has decided
against it everywhere (step 13: carried at cost is a DECLARED property of an asset nobody trades,
and a bill trades weekly). Marking is also the more exact of the two: the holders' total gain over
a bill's life is `face × (1 − p₀)` whatever path the price took, because it ends at par, and that
is precisely the treasury's cost — where the locked-rate reading would accrete a BUYER at the
issuer's original yield instead of at the price it actually paid.

Atlas: short-term-debt E2 closed (17/9/1) and sovereign-credit F2 closed, E1 caught up to its own
DIFF prose, E3 ❌→⚠️ for what is left, and the five-structures table's row 4 corrected — it still
said `07c` clears a YIELD, which §9.13-SOV row 4 made false. That file's tally read 25/15/27
against a table holding 28/12/27: **the third file to drift by exactly the mechanism §5 names**, so
it is COUNTED at 30/12/25. Gates green; no run (rule 11).

**13-EQUITY — THE STORED VALUE IS RE-DERIVED, AND THE HOUSEHOLD SECTOR HOLDS A REGISTER BOOK.**
Two commits, because reading the code corrected this step's own claim that they had to be one:
the mark rewrites a row's VALUE and the household work ADDS rows.

**a — the mark covers every row it can price.** `markCreditBook` became `markBookToMarket` and the
stage `register-marking`. EQUITY had the opposite half of credit's defect: a row stores its shares
AND its value, and only a session that TOUCHED the row rewrote the value, so a holder that did not
trade this week carried its shares at a stale print — and its NAV, its capital ratio and every
allocation sized off them were struck on last week's market. `equity.md` C3 read ✅ against
`markHolding`, a one-row setter used by bill accretion; the node asks whether a HOLDER is marked
and the honest answer was no. **The SOVEREIGN turned out to have step 13's item 3 in full**: `07c`
strikes a price per bond and `07f` a price per bill, and both kept nothing but the yield those
prices implied — "the auction already computes the price it needs and discards it", in the one
class that had already priced its way out of the defect. Both deposit now. Government BONDS mark;
discount BILLS do not, because `bill-accretion` already owns their value, and rather than make two
writers of one number that became §3's **13-BILL**.

**b — households become holders of record.** `holderIdOf` resolves the HOUSEHOLD party, so the
sector has a register book per region, opened by wire at the seed with exactly the shares no named
book held and moved only by trade since. What it replaced was a SUBTRACTION —
`marketCap − institutions − desks`, recomputed by two different routes (`householdDirectEquityLocal`
and 07e's sell channel) that could disagree about what the sector owned. **"The public float" was
that same residual under a second name** (rule 4, and the user's question): the dividend walk paid
`denom − register − desks` to the household sector because there was no holder of record to pay.
Both are gone; the walk pays households on their own rows, the `unheld` term is zero by
construction, and where it is not the shares are on nobody's book — a defect for `O2` to report,
not money to hand out.

**The trap this step is really about is the walks.** A holder added to the register is a holder
that every walk written as `updatedInstitutionalEntities.forEach` silently skips — which is how the
desks accrued nothing for thirteen weeks (row 2), and how a buyback would have scaled the
institutions and left households whole, handing the sector free shares. `registerBooks` is now the
ONE statement of who the register's holders are, and the corporate actions, the week's
consolidation, the close's mark, `O2` and the UI's `holdersOf` all take it. The payment reason
splits too — `dividend to holder of record` against `security payment to holder of record` — since
the household income line keyed off the residual's own name.

`holders.tsx` no longer explains who is missing, because nobody is: the desks are read off their
banks beside the register books, and the hint that said *"households and the float hold the rest"*
named one thing twice. Gates green; no run (rule 11).

**13-CREDIT row 5 — THE MARK, WIRED IN: A CREDIT ROW IS WORTH `units × price` AND THE BOOKS GO ON
TRADING FACE.** The attempt recorded in `LOG_ARCHIVE` as "13 (part 3)" built this and did not wire
it, and named two blockers. Both are closed, and the first was bigger than that record read.

**Blocker 1, the face leaks — one cause.** `faceLocal` and `units` were two representations of one
number (rule 4), and only `units` has a lane in the columnar store. So the books wrote a face,
`materializeBook` dropped it at the week's close, and every reader fell back to the value: a face
that cannot survive a week is not a face. `faceLocal` is DELETED. Then the writers, none of which
maintained the lane that did survive: **`newBookRow` never copied it at all** — and it is the row
builder THE CLEARING WRITE-BACK uses, so every fill every book has ever written lost its face
there, reporting the VALUE if the row was recycled (`freeRow`'s NaN) and ZERO if it was fresh (the
lane's own default), decided by the free list. `debitRow` never subtracted it, so a holder that
sold half a position still reported the whole face; it now takes the row's own units in proportion,
so no caller has to know. The duplicate-row merge folded money and not paper; `addShares` wrote
value and not units; `scaleHoldings` scaled the money on a corporate action; `estate-resolution`
read `qtyLocal` into a variable it had named `claimedFaceByInstrument` and handed the same number
to `retireLadderFace`, which takes a FACE. All value-preserving while credit marks at par, which is
the archive's own lesson and why they land first.

**Blocker 2, the mark not being the last word.** It runs after `register-consolidation`, at the
close, when every stage that can write a register row has run — not after `holdings-writeback`,
where the first attempt put it and where everything downstream writes the book back into par space.
And every reader that means FACE now takes `units`: `audit/ownership.ts`'s O1, O6 and O7 (O1 also
stops reading the derived REGIONAL desk arrays, which keep only money, and reads the per-bank books
O6 has always read); `holder-paydown`; and — found on the way, and live damage since row 1 rather
than a consequence of this one — **the coupon split**. `applyHolderInterestAccruals` apportioned an
issuer's week by `qtyLocal`, the register's money, against desk positions carried AT MARKET, so a
holder of a discounted bond accrued less of the same coupon than a holder of identical face bought
at par. A coupon follows face. The corporate-action walk went the same way: its denominator is now
in the instrument's own unit throughout — face for credit, SHARES for equity, against shares
outstanding rather than market cap — and a redemption pays face.

`clearedBookDelta` takes a UNIT delta and prices it, because the rows claimed off a book carry last
week's mark while the rows appended are written in par space, and a delta on the money is the
revaluation plus the trade. `bookPositions` is deleted: no caller, and what it returned was a book
in money at the one moment the only honest before/after is in units.

Gates green; no run (rule 11). **This is the step that must not be byte-identical** (§3.13): every
credit balance sheet in the model moves the week it lands.

**13-CREDIT row 4 — THE PAPER BOOK CLEARS A PRICE, AND THE ISSUER-LEVEL SPLIT IS DELETED FROM THE
WHOLE MODEL.** The same three-part correction, on the last book still making it. `07f` prices one
instrument per piece of COMMERCIAL PAPER — every live programme at its own remaining life plus the
week's deal as its own tranche — `statKind: 'PRICE_LIKE'`, with each buyer's reservation still
computed as a YIELD (a cash fund's alternative genuinely is the paper its money would otherwise sit
in) and stated as the price that yield implies over that paper's own life, which is the sovereign's
own move from §9.13-SOV row 4. The treasurer's walk-away is the revolver restated as a price floor.
The primary is struck at PAR off the region's cleared front end plus what the borrower's own printed
paper says it pays there, so a concession shows up as a price below par and the issuer receives
price × face. `credit-price.ts:trancheClearedPricePerFace` is now a LOOKUP WITH NO ARITHMETIC IN IT:
with bonds, loans and paper all printing prices there is no class left whose price has to be derived
from somebody else's cleared spread, which closes `bond.md` N7.b on both types and
short-term-debt A2/D1/D2/D4.

Three things died with it. **`register-split.ts` is DELETED** — 07f was its last caller, so `O7`'s
migration of a claim onto a borrower's other paper and `O8`'s position keyed as though a company
were a security are gone from every credit book (what remains of both is the seed's own rounding).
**`dealer-desks.ts`'s `clearingKeyOf` is deleted too, and it was live damage**: it rolled a desk's
stored per-tranche positions up to the ISSUER for the auction's benefit, which was right while books
cleared per issuer and became wrong the moment they stopped — so since rows 1 and 3 (and since
13-SOV rows 3–4 for the sovereign and bill books) every desk entered every session declaring itself
FLAT in paper it was carrying, and `applyDealerDeskFills` then marked none of it. **And
`cpReservationYieldBps` had a rule-9 units defect**: it scaled the expected loss by `tenorWeeks / 52`
and added a THIRTEEN-WEEK loss to an ANNUAL alternative, quartering the credit compensation on every
piece of CP in the model and disagreeing with the bond book's own `computeReservationSpreadBps`
about what an expected loss is. Both terms are annual now; the horizon does its work in the
discounting, where it belongs. `assets/index.ts` also had `LEVERAGED_LOAN: quotedAs: 'SPREAD_LIKE'`
a row after that book started printing prices — corrected, and worth recording because NOTHING reads
`quotedAs`, which is exactly step 13's item 6.

Gates green; no run (rule 11).

**13-CREDIT row 3 — THE LOAN BOOK CLEARS A PRICE TOO, AND `leveragedLoan` IS DELETED WHOLE.** The
same three-part correction row 1 made to the bond book: a discount margin is not a price (the engine
valued a `YIELD_LIKE` fill at 1, so a unit of loan par changed hands at a dollar), an issuer is not a
piece of paper (`register-split.ts` invented the register's rows from an issuer-level fill), and one
margin per borrower is no term structure. `07d` prices each of an issuer's live syndicated floating
tranches, `statKind: 'PRICE_LIKE'`, with each holder's reservation margin restated as the price it
implies on that loan's own schedule, and deposits what it printed.

**`Company.leveragedLoan` is gone**, for the reason that deleted `oasSpreadBps`: every field it
carried was a PRICE or SPREAD that belongs to the paper (`pricePar`, `discountMarginBps` and its
history), a DUPLICATE of what the ladder states (`quotedMarginBps` is the row's own margin,
`tenorYears` its dates), or a CONSTANT (`seniority`, `referenceBenchmark`, and a `recoveryRate` the
book re-derives weekly anyway). What replaced it is the borrower's own LOAN CURVE, read off its own
loans and kept apart from its bond curve because a first lien and an unsecured claim are two risks on
one name — `credit-price.ts` takes a `RegionRates` and a row filter now, so `IS_BOND_ROW` and
`IS_LOAN_ROW` make every caller say which market it is asking about.

`07d:pricePar = 100 − ΔDM × duration × 100` — a price linearised out of a cleared margin, `bond.md`
N7.b's forbidden direction, reaching the loan index and the player's book — is deleted with
`pricing.ts:priceLeveragedLoan`, which it was the only caller of. The index's two credit halves
collapse into one read of the price store (closing atlas indices A2/D2), `12-portfolio` marks a loan
at what it cleared at, and row 2's accrued leg lands on this book at the same time, because it needed
exactly the per-tranche face delta this row created. Step 18's `07d:86-88` duration clamp goes the
way `07b`'s did — with the issuer instrument, not by being fixed. The seed deposits an opening price
for floaters too, at the rating table's spread discounted for the first lien.

Gates green; no run (rule 11).

**13-CREDIT row 2 — THE BUYER PAYS THE SELLER WHAT THE BOND HAS ALREADY ACCRUED, AND THE DESKS
TURN OUT NEVER TO HAVE BEEN HOLDERS OF RECORD AT ALL.** 13b built the leg for the sovereign and
could not carry it across, because the corporate auction named a COMPANY while the accrual ledger
names a tranche and there was no per-tranche face delta for the accrued to ride. Row 1 gave every
fill its own paper, so the leg is now `accruedOnFills` with a `moveCorporateAccrued` beside
`moveSovereignAccrued`: each participant's own face delta times what one unit of that tranche has
accrued since its own last coupon date, settled through the same clearing house as the paper and
re-keyed on the ledger in the same pass (rule 5). Read at `currentWeek`, because the weekly accrual
runs in stage 08 after this book. `AccruedLeg`'s issuer becomes per INSTRUMENT — a book of many
borrowers has many issuers to owe it, where a sovereign book hands back the same treasury every
time.

**The defect it uncovered is the larger half.** `deskHoldingsByIssuer` returns a map keyed by
`p.instrumentId` — a TRANCHE, since 13b — and both callers looked every entry up by ISSUER id, so
**every tranche-keyed desk position missed**: the desks accrued nothing on the corporate register
and their share of every coupon and every corporate action was paid to the other holders, which is
the exact defect "THE DESKS ARE HOLDERS OF RECORD TOO" was written to remove. The only path that
ever matched was an underwriting residual, stored under the issuer's id until row 1 gave it the
deal's tranche. Both sides name the same paper now, so the split is per instrument and the roll-up
that bridged the two key spaces is deleted whole: an issuer's register total carried beside every
tranche's, a per-row issuer resolution to build it, and a scale-down at the payment. The leg had to
have this: it re-keys balances the weekly walk builds, and a desk that sold would have gone negative
against a balance it was never given.

Gates green; no run (rule 11). 07d and 07f still clear per issuer, so their accrued leg waits on
rows 3 and 4. **And four stale atlas rows re-marked** — `bond.md`'s N7 · sov, N7.b · sov and N8 · sov,
closed by 13-SOV rows 3 and 4 and never re-marked, plus N7 · corp, which row 1 closed and did not
re-mark either; the tally was recounted rather than adjusted because it had drifted too. §5 carries
the lesson.

**13-CREDIT row 1 — THE CORPORATE BOND BOOK CLEARS A PRICE, PER TRANCHE, AND A BORROWER HAS NO
SPREAD.** 07b priced one instrument per ISSUER and cleared a SPREAD, and all three halves of that
were one mistake: a spread is not a price (the engine values a non-`PRICE_LIKE` fill at 1, so every
corporate bond changed hands at FACE — the sovereign's §9.13-SOV row 4 defect, one class over); an
issuer is not a piece of paper (which is what forced `register-split.ts` to invent a tranche mapping,
and that invention IS `O7` and `O8`); and one spread per borrower is no term structure. The
instruments are now the issuer's live fixed tranches, `statKind: 'PRICE_LIKE'`, each cleared price
deposited in a new price store (`engine2/prices.ts`, forgotten when its row is freed) so nothing
re-derives one. **`Company.oasSpreadBps` is DELETED** (user, 2026-09-04: *"there shouldn't be any
spread per issuer… There is no spread quantity associated with an issuer aside from the CDS"*), with
its history ring, its stage-08 lane and its company-store field; every reader moved to either the
PAPER's own spread (`credit-price.ts:rowSpreadBps`) or the borrower's own CREDIT CURVE
(`domain/credit-curve.ts`, read at the maturity the caller means and told whether a bond traded
there) — the call test, the cost of new debt, the bridge margin, the CDS cash leg, the bank funding
spreads, the index cohorts, `P1`/`P2`/`P3`.

The term structure needed no new parameter: spread-risk capital already scaled with duration and the
distressed bid already discounted over a horizon, and both were being fed one blended ISSUER duration.
Per tranche they give a performing name an upward-sloping curve and a distressed one an inverted
curve, out of the hazard the model already had. Step 18's `07b:110-119` (a ladder blended into one
duration × 0.75, clamped [1,8]) is gone with the issuer instrument, not fixed.

Five things fell out. A **primary deal is its own piece of paper**: struck at par against the issuer's
own curve, its PRICE cleared beside the outstanding stock, so the concession is a price below par and
the issuer receives price × face instead of par whatever it cleared; stage 08 issues the terms 07b
struck rather than re-deriving a coupon. A claim on **paper that has retired is repaid by its
borrower** at its own face instead of migrating onto that borrower's other bonds — and the desks'
positions, always stored per tranche, are finally on the same key the paydown measures outstanding
on, so they were never once paid down before. `index-calculation` **reads** the cleared price instead
of discounting to one through Nelson-Siegel (one of step 13's two conventions). The prime broker's
credit haircut is the **price move the bonds themselves made**, deleting a five-year duration
assumption and a sovereign add-on. And an instrument with no float and no offering **keeps its
price** rather than depositing the bracket (§3.21).

Not byte-identical and not meant to be: fills settle at price × face while the register still carries
FACE, exactly as the sovereign does since row 4, and `P5` is now that gap's measurement rather than a
sizing of "credit trades at par". Gates green; no run (rule 11). Cost noted, not measured: the
reservation is two `priceFromSpreadBps` calls per (holder, tranche) where it was one arithmetic
expression per (holder, issuer), and a spread read is a 60-step bisection.

**The dead-file sweep (part of step 19, done early for a handover).** Seven files with no importer
anywhere: `engine/columns/{arena,company-table,tranche-table}.ts` (SCALE wave 2's parallel company
and tranche tables — `engine2/` is the one that shipped), `engine/ledger/{index,parties,balance}.ts`
(a money facade nothing imported, the party-kind registry only that facade re-exported, and an
`Account` interface whose stated target `engine/ledger/accounts.ts` already reached), and
`engine/simulation/ipo.ts`, a file whose whole body was `export {}` and a note saying where the
logic used to live — which is what git history is for. `check-hygiene.sh`'s asset-switch exemption
for `parties.ts` went with it and the ratchet fell 54 → 49. Step 19's other two named files were
CORRECTIONS: `engine2/state.ts` (5 importers) and `stages/register-index.ts` (7) are live, and the
audit's "zero importers" claim about them was stale. The same sweep measured 369 dead exported names
in 147 files and left them to step 19. CI now runs all five of §4's gates (it was missing the
build), and its own stale counts are gone.

**13b — a bond's price is CLEAN, so the buyer pays the seller what has already accrued.** The
accrual ledger was correct per holder and nobody ever paid for it: the seller carried the interest
it had earned until the coupon date, financing the issuer free, and the buyer collected a coupon it
had only partly earned. The leg is `book-settlement.ts:accruedOnFills` — each participant's own face
delta times what one unit of that bond has accrued since its own last coupon date — settled through
the same clearing house as the paper, with the accrual ledger re-keyed by the same amount in the
same pass (rule 5). The net is not zero and must not be: the participants' deltas sum to what the
week's PRIMARY placed, and seasoned paper the treasury places carries accrued nobody has been paid
for, so the net goes to the treasury and its receivable to the holders rose with it.

One owner for "where is this bond in its period": `weeksAccrued`, split out of `accruedPerFace`, now
read by the seed's credit side, the seed's sovereign side (which counted `since % 26` itself, off a
period the tranche did not state) and the trade leg. The leg does NOT live in `clearedBookDelta`,
where the first draft put it: that function sees only the holders whose books a stage happens to
rewrite, so an accrued computed there covers part of a session and nets to nothing anyone can pay.

Sovereign only. 07f has nothing to move — a bill pays no coupon and its whole return is the discount
— and 07b/07d cannot until they clear per tranche, because the ledger is keyed per tranche and the
auction names a company: re-homed onto step 12's tail, which already owns three findings from that
same key mismatch. Two findings it turned up are §3 13e (a bank's govvie desk and the central bank
hold sovereign paper and accrue nothing) and 13f (an institution's accrued coupon is on no balance
sheet). Atlas: `bond.md` N9.b sov ✅, corp ⚠️ with its blocker named; `corporate-credit.md` D7 the
same.

**13c — currency is a universal characteristic, and the step is closed.** Parts 1 and 2 built the
type and put it in settlement and accounts; this run closed the rest — the obligations and the
cleared book naming their own money (13c-DENOM), the rename's prerequisite (13c-RENAMEABLE) and the
rename itself (13c-RENAME). The one bullet that cannot be closed by reading, `13c-FX-3`, is re-homed
to PART VIII beside the run that settles it, with its decision stated: the household leg and the
firm leg are one question, not two, and the answer is a measurement. The money-naming rule stays at
the head of §3 with step 12's key policy, because PART II's steps are written against both.

**13c-RENAME — 11,821 lying suffixes, and five true ones left.** Every `…USD` identifier whose
figure is in its owner's own money is now `…Local`; a figure whose currency is named beside it lost
its suffix entirely (`DerivativeContract.notional`, because the contract carries `currency`); and
`…USD` survives on exactly five names that mean it — `foreignOfficialClaimsUSD`, the three seed
primitives that are the USA's own price level, and `PAR_USD`, a `countedIn` enum value that is not
a figure. Staged tree-wide by identifier group with `tsc` between, which the previous commit's work
made safe.

Two things it found, both of the same shape — a field name in a string nothing checks. `scaleFirmSize`
had a fifth unchecked list, now `satisfies keyof Company`, and that constraint caught a dead entry:
`annualInterest` is not a `Company` field, it is derived from the ladder, so the scale had been
silently no-opping on `undefined`. And `check-hygiene.sh`'s guards are shell regexes over identifier
names, which nothing can type-check: the rename killed three of them silently — they matched names
that no longer existed and could never fire again. Repaired, verified by making each fire, and the
file now says that a guard of that shape must be updated WITH any rename of the names it watches.

**13c-RENAMEABLE — the `…USD` rename could not have been verified, and now it can.** The rename is
11,821 occurrences of 1,439 identifiers, and it is type-safe only if every field name the code
depends on is one the compiler checks. Three places broke that, found by probing rather than
assumed: renaming `Company.grossPPEUSD` produced **35 errors across the tree and NONE in
`company-store.ts`**, whose lane list kept the stale string, compiled, and would have read
`undefined` off every company for ever. `bank-identity-trace.ts` had the same shape twice —
`fieldsOf` was annotated `Record<string, number>`, so `keyof` it was `string` and the `FIELD_SIGNS`
map it is supposed to correspond to was checked against nothing; a renamed field would have made
`FIELD_SIGNS[k]` `undefined`, the residual NaN, and the instrument silently stop attributing. The
harness read the same sheet through a `Record<string, number|undefined>` cast.

All three are compiler-checked now: the lane lists `satisfies readonly (keyof Company |
DerivedF64Field)[]` — which also forced the honest split between MIRRORED lanes and the three that
are READS (`marketCap`, `totalDebt`, `cash`) — `fieldsOf`'s return type is inferred so its keys are
a literal union, and the harness reads the sheet. Each was verified by making the break and watching
the compiler catch it.

**13c-DENOM — an obligation, and a book, say what they are denominated in.** `TradeInvoice` was the only one that
did; the rest re-derived it at each payment site from a proxy. `SecurityLoan` read
`issuer ? currencyOf(issuer.region) : <the lender's own money>` — in the very branch whose condition
is that there may be no issuer, and that `!` threw in week 5 of the reference run. A
`DerivativeContract` read `currencyOf(c.regionId)`, where `regionId` means the clearing market for
IRS and CDS, the HOLDER's region for an FX forward, and a hard-coded `'USA'` for a commodity future
— the region field standing in for the fact that commodities are quoted in the numéraire. Both now
carry `currency`, set once at strike, and every payment reads it.

`settleClearedBook` re-derived `currencyOf(regionId)` at each of its five cash legs; the book now
names its money once and the legs read it. It was NOT put on `ClearingInstrument`: settlement is per
book, every instrument in a book shares a currency, and a per-instrument field would be one nothing
could act on — which is how `quotedAs` came to exist unread.

The PE commitments are NOT the same case and no field was added: a commitment is to the FUND and is
payable in the fund's money, so reading the sponsor's is the fact rather than a stand-in, and a
field would be a second representation with one possible value (rule 4). What makes it one value is
a filter in the seed — LPs are matched `e.region === regionId` — so the finding is the condition:
the day a cross-border LP exists, the commitment needs its own denomination. Recorded where that
would be read.

**13-SOV row 5 — the curve has ONE owner, and the sovereign conversion is complete.** A region's
zero curve was carried twice and the two could not agree: 07c fitted `yieldCurveParams` through the
bonds it cleared and published all five `zeroRates` off that fit; 07f then refitted the parameters
through its bills PLUS four synthetic points read straight back off `zeroRates` — a fit through the
previous fit's own output — and wrote only `tenor3M`, leaving 2Y–30Y at 07c's values. Parameters
described one curve, published points another, consumers split between them (`P6`: all 20 points
disagreeing, worst 36bp). `sovereign-curve.ts` is the one owner: both sessions clear against the
curve standing at week start — which is what a real session prices against — and deposit what they
observed, and it fits ONCE through all of it and publishes every field as a read. A week with no
cleared point leaves the curve alone, which is the answer and not a fallback. `P6` becomes the
guard on that rather than a measurement of it. Also deleted: `computeSovereignBookAnnualYield`'s
private copy of the tenor interpolation (`zeroRateAt` is the one read), and `SOV_BOND`'s stale
`quotedAs: 'YIELD_LIKE'`, which row 4 made false. **All five parallel structures are gone.**

**13-SOV row 2 — the sovereign ladder IS the store; the array is gone.** `reg.govDebtTranches` was
the second of the five parallel structures: a plain array beside the one tranche store, rebuilt by
three stages a week and diffed back into the store by `reconcileLadderByWire`. All three writers now
move the store as the events they are — 11-fiscal RETIRES what matured and ISSUES what it funded,
07c and 07f retire the unplaced face off the bond's own row — and every reader takes
`materializeGovLadder`. Deleted with it: the `Region` field, `reconcileLadderByWire`,
`withdrawUnplacedIssuance` (an array rebuild for a one-row retirement) and the STORED
`tenorAtIssuanceYears`, which disagreed with the dates on 20 of 260 rungs. The seed still needs a
ladder before a store exists to hold it, so it rides the stash idiom `stashOpeningCash` already
uses and dies at `openSeededMirrors`; `GovDebtTranche` is now what an issuer STATES and
`GovDebtTrancheView` what a reader gets, so the compiler enforces that a tenor is derived and never
written. `government-entity.ts` and `macro/evolution.ts` take the ladder from their callers, which
is how every other world read already reaches those modules.

**12b — pricing is centralised, and what is left of it belongs to the steps that own the
mechanisms.** `domain/pricing/` owns the time value of money and eight modules call it. Verified by
reading, not assumed: `engine/pricing.ts:priceCorporateBond`/`priceLeveragedLoan` and
`carryCalculator.ts` have exactly ONE caller between them, `12-portfolio-and-positions.ts`, which
step 26 deletes outright — so the functions die with it, recorded there. `index-calculation.ts:52`
and `nelsonSiegel.ts`'s continuous-vs-discrete convention are step 13's, recorded there. Nothing
left that is 12b's own.

**12 — one thing, one key: the tail is step 13's, not a step of its own.** What was left (`O8`,
0.42B on 219 positions) is `register-split.ts:63` falling back to the ISSUER's id when the ladder of
that kind is empty at split time. It cannot be closed before the clear moves to the tranche: drop
the row and the holder's cash leg has no security (rule 5), key it anywhere else and it is the same
invention renamed. Recorded on step 13, which already owns the file and the other two findings in
it. PART I is closed.

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
