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

    **THE FINISHED CLASSES ARE IN §9** — 13-SOV, 13-CREDIT, 13-EQUITY, 13-BILL and 13-READ, so
    **inventory at cost versus price is the next class**, once 13-BOOK below is through. What they
    left OPEN, and nothing else:

    · **`equity.md` C2.a — households have no BUY schedule.** They hold a register book per region
      now (13-EQUITY), so the largest holder class in the model can be forced to SELL and can
      never bid. A mechanism, not a representation, and it belongs with 07e.
    · **13-READ D13 — THE SEED'S REORDERING.** The seed's three house-bank passes share one
      assignment rule now, but they are still three passes: each feeds `applyBankFundingSplit` in
      its own scope, and the seed steps between them — the SME and household debt migrations, the
      pools' opening cash — run against banks that must already carry what the pass before placed.
      "One pass at the end" means moving the funding-split application to the end of the seed,
      which wants the seed's step order read whole and is not a collapse.

    **13-BOOK — THE ONE BOOK: ONE ID SPACE, ONE WRITE PATH, AND TABLES THAT CAN BE CHECKED
    AGAINST EACH OTHER** (user, 2026-09-05: *"I want a single source of truth for whatever is
    possible to do so, at any cost"*, *"make it impossible for something to change an object or an
    entity outside of some clear input/output layer and make it easy to check between the tables
    if they are consistent (all issuers still exist, etc.), similar to how money already works"*,
    and *"currency should live in the right place, it's a fundamental nature of an asset"*).
    **This absorbs 13-OUTSIDE**, which was the same step seen through one asset class.

    **THE MODEL ALREADY HAS ONE EXAMPLE OF WHAT IS BEING ASKED FOR, AND IT IS MONEY.** A balance
    moves only through `pay()`; identity is a `PartyRef` and never an object reference;
    `v2.accounts` is the only store; and a payment with no counterparty is a defect at its site
    rather than a leak. Nothing else in the model has all four. This step is that discipline
    applied to everything that can carry it.

    **WHAT IS TRUE TODAY, MEASURED** — restated after (a), (b) and (c); a bullet the finished
    slices closed is marked rather than deleted, because the diagnosis is what the open slices are
    aimed at and a reader has to see the whole shape.
    · **Entities have four identities.** `PartyRef` (the ledger's), `v2.rowById` (a universal
      id→row allocator, 28 sites), `Company.id` and `Company.ticker` — **845 `.ticker` references
      and 155 `ByTicker` maps** — and `PartyRef` is itself inconsistent, keying COMPANY and the
      three BANK kinds by TICKER and INSTITUTION by ID. **CLOSED by (c)**: all four are branded, a
      named function stands at every crossing, and `PartyRef` is a view of the entity store keyed
      by `EntityId`. What is left is that `Company.ticker` still keys ~470 reads and 129 maps,
      each marked at its site as a display name or a participant seat, never an identity.
    · **Instruments have no registry of instances.** Debt is `v2.tranches` (real, one writer);
      **equity's issued side is `Company.sharesOutstanding`, a scalar with no instrument record**;
      derivatives are `v2.contracts`; fund shares reuse the holder's ENTITY id as an instrument
      id; goods are sub-unit ids. ~~The KIND has four taxonomies, which `assets/index.ts` documents
      and reconciles with a superset rather than replacing.~~ **CLOSED by (e)**: one list,
      `assets/index.ts:InstrumentKind`, and every other union a view of it.
    · **Positions live in eight stores** — the register plus the bank's `sovereignBondHoldingsByBond`
      and `dealerDeskInventory`, the central bank's book, `Company.treasuryHoldings`, three derived
      regional desk arrays, `etfShares` and `portfolioCompanyIds` — and `v2.lots` beside them.
    · ~~**One intern table holds every id space.**~~ **CLOSED by slice (b)** — seven spaces, seven
      numberings, the whole table behind fifteen functions in `world.ts`. It was one array in
      which an instrument id, a region id, an entity id and the literal `'CORP_BOND'` were the
      same integers, with only naming convention preventing a collision.
    · **CURRENCY IS DERIVED FROM A PROXY, AND SMUGGLED INTO A UNIT'S NAME.** `DebtTranche` has NO
      currency field; every amount is `…Local` and every payment reaches for `currencyOf(region)`.
      `UnitOfMeasure` is `PAR_USD | SHARES | GOODS_UNITS | CONTRACTS | USD` — **the quantity's
      unit and the money are one label**, so a bond's par and its currency cannot be stated
      separately and a cross-currency issue is inexpressible. §9.13c-DENOM gave an OBLIGATION and
      a BOOK their currency; the INSTRUMENT never got one, which is the half that matters, because
      it is the instrument that has the currency and everything else that borrows it.
      (`sovereign-credit.md` A4.b is the same absence from the sovereign's side: *"in its own money
      it can always create more; in someone else's it cannot"* — inexpressible while the money is
      a function of the region.)

    **THE SEVEN STORES, each the only place its fact lives.** ENTITY (who exists) · ASSET (what
    KINDS exist, and what a unit of each is) · INSTRUMENT (what INSTANCES exist: kind, issuer,
    currency, issued units — an INDEX that copies no quantity) · POSITION (who holds what, as LOTS
    with a basis) · PRICE (`v2.prices`, done) · TERMS (a bond's schedule, a contract's legs — per
    class, each already one writer) · ACCOUNT (`v2.accounts`, done).

    **THE I/O LAYER, AND IT IS THE POINT.** Each store exposes a `Readonly` view and a ledger, and
    the mutable handle is module-private — the shape `mutableHoldings` and `mutableTranches` already
    have, made total. `structuredClone` on the host state must keep working, so these are plain
    data with private accessors, never classes.

    **THE WALL IS UP ON ALL SIX STORES, HAS ONE DOOR, AND THE REGISTER IS ONE REPRESENTATION — d0
    and d1 in §9.** No file outside `engine/ledger/` and `engine2/` names a mutable handle, and
    `check-hygiene.sh` fails the first that does; the rows are the register, `entity.itemizedHoldings`
    is the week-end view `core.ts` materialises and nothing in a week reads, and the mirror's sync
    machinery is deleted, on the register (d1) and the ladder (d1b) alike, and every wire resolves
    both parties and its instrument against the world before it is written (d2). What is LEFT on
    the enforcement side is the books outside the register (d3).

    **THE CROSS-TABLE CHECK IS AT THE WRITE, NOT IN A GATE** (reviewed 2026-09-04: a scan of four
    tables needs a STATE, so "a gate in `check-hygiene.sh`" is either a run — rule 11 forbids it —
    or a test over the seed, which is the weak form). The strong form is `pay()`'s: `wire()` and
    every ledger operation resolve both parties through the entity index and the instrument through
    its store, and `defect()` on a miss — an unknown holder, an unknown instrument, an issuer that is
    not alive. Today `wire()` throws on a non-positive quantity, a self-wire and a missing journal,
    and on nothing about WHO or WHAT; `O3`, `O8` and `O11` find it a week later as a count. After
    (d2) they are regressions rather than the detection, and the pure test over the seeded state is
    the gate-time half.

    **THE SLICES, each its own commit, in this order.**
    **(a) BRAND THE STORE KEYS, (b) SPLIT THE INTERN TABLE and (c) THE ENTITY REGISTRY are DONE
    — in §9** (a; b in three steps; c1, c2a/b/c, c-then-1/2/3a/3b/4). `refs.instruments.strings` is the list of every instrument the world has
    named, which is what (d) is built on;
    `domain/party.ts:PartyRef` is the one party union, which is what (c-then-3b) needs; and every
    entity id, ticker and instrument id is a branded type with a named function at every crossing.
    **Three things they found and handed forward, all of them (d)'s:**
    · **The ETF share has two keys** — `ETFSHARE-<fund>` in the clearing book, the fund's own
      entity id in the register. (d) deletes one of them.
    · **An index's constituents are ISSUERS in a field named `instrumentId`** (`indices.md` A1).
      `rebalance` mints every constituent as an equity id whatever the asset class, and all THREE
      readers — `index-calculation.ts:basketValueLocal`, 07b:571, 07d:489 — read it back as an
      issuer, so the equity side wants a borrower as much as the credit side does. (d) decides
      which way it resolves: the field splits by asset class, or a credit index states tranches.
    · **`DerivativeContract.referenceId` is four id spaces in one `string`**, discriminated by
      `classId` alone: an entity id from the CDS book, a commodity id, a REGION from the FX
      forward, `''` from the swap. Same shape, same resolution.

    **(c) IS CLOSED** — c-then-3b and c-then-4 in §9. `PartyRef`'s five entity arms key by
    `EntityId`, the eleven stored ticker references are in the entity space, the seat→party
    crossing is one named function per stage, and `O8` walks every party-keyed store.

    **THE OPEN SLICES — REORDERED 2026-09-04 (user), ENFORCEMENT FIRST.** The twelve commits of
    (a)–(c) were identity plumbing: necessary for (d), byte-identical, and after all of them the
    user's sentence — *impossible to change an object outside a clear I/O layer, violations throw
    at the site* — was still false in four places (the mirror, the open doors, the write that does
    not resolve its parties, the books outside the register). The old order put every one of those
    behind three large representation refactors. The new order puts them first, each small and
    byte-identical, so the goal is mostly in hand before a number moves:
    d–f. **DONE, in §9** (2026-09-05): the instrument index (dI–dV), the contract store and its
       six kinds (d4a–d4c-vi), the liens (d5a–c), the one kind list (e), and the position book as
       lots with a basis, the goods and the accruals on it (f1–f5). What is left of PART II's
       13-BOOK:
    g. **PLANT AND HOUSING JOIN** — BLOCKED on step 26 deciding what a unit of plant is. Not a
       cost exclusion: there is no unit to register until that decision is made.

    **WHAT IS NOT IN THE BOOK, AND WHY.** SME pool loans, mortgage vintages and consumer pools are
    positions of the BANK with no register of their own — that is 37-LOANBOOK, sequenced there
    because it needs 37-LOSSRATE's answer to "what is a loan". The employment relationship is the
    non-financial twin of this step and is 37-EMPLOYMENT.

    **IT WILL MOVE THE NUMBERS AND SLICE (f) WILL MOVE THEM A LOT** — the merge changes iteration
    order, so float identity goes, and the basis columns are new. That is expected (rule 11: the
    harness is red by design and step 38 owns the measurement). What does NOT bend is the
    sequencing: (f) is done WRITERS-FIRST — every writer maintains a lot chain while the chain's
    sum still equals today's `units`, where nothing can break because the two numbers are equal,
    and only then do readers take the basis. That discipline is what made §9.13-CREDIT row 5 and
    the household books work and its absence is what parked `13 (part 3)`. Speed here is bought by
    slicing, never by skipping it.

    **THE CONTINUOUS-VERSUS-DISCRETE CONVENTION** (step 12b, §9.12b): `engine/nelsonSiegel.ts`
    discounts CONTINUOUSLY (`exp(-z·t)`) where `domain/pricing/` compounds discretely — two answers
    to one question (rule 4). The remaining NS sites, enumerated at §9.13-BILL rather than assumed:
    `11-fiscal` (two coupon strikes), `pricing.ts` (which `call-protection` and `12-portfolio`
    reach through), `stage08-back:1348` (a refinancing's risk-free) and `macro/initialization:392`
    (the seed's coupons) — **steps 25 and 26 own those four**. Three more are PERMITTED and are not
    work: `07f:166` (a bill bidder's own reservation, `bond.md` N7.b), `sovereign-curve:43` (the
    fit's one owner PUBLISHING it) and `audit/prices:249` (`P6` MEASURING the fit against the
    cleared points).

    **11f AND STEP 12'S TAIL ARE CLOSED, in §9** — the register was keyed by TRANCHE and the
    auctions cleared by ISSUER, so `register-split.ts` had to invent the mapping; it is deleted,
    along with `dealer-desks.ts`'s `clearingKeyOf` on the desks' side. **What is left of `O7` and
    `O8` is the SEED's own rounding — 37-SEED (b).** And of `bond.md` D7, that the accrual is
    apportioned weekly rather than daily, which is the model's clock everywhere and not a defect.

15b. **News slice 2** — split 2026-09-05; 15b-i (a workout that develops: the estate's week and
    its story) is in §9. What is left, one commit each:
15b-ii. **An auction that failed or came in under-subscribed.** 07c and 07f withdraw what the
    primary did not place (`sovereign issuance withdrawn`, `bill issuance withdrawn`) and record
    nothing a story can read; the treasury's account runs lower in silence. The region records
    the week's auction — offered, placed, withdrawn, by bond — and the story names the shortfall
    and what the treasury did about it (the advance it drew, the need that rolled forward). A CP
    roll that fails already tells its story (`07f`, "CP Roll Fails"); bring it onto the derived
    feed's shape (refs, materiality, cause) rather than beside it.
15b-iii. **Contract-break streaks.** No object here is called a contract break. The real thing
    is a party that does not perform: the settlement pass's `[unresolved]` legs (a leg addressed
    to a bank with no sheet), a derivative closed out on a counterparty's death
    (`derivative-lifecycle.ts:closeOutDerivativesOfParty`), a CP roll the market refused. A
    streak is the same party failing to perform in consecutive weeks. Record the week's
    non-performances by party (the ledger has them; nothing keeps them), count the run, and tell
    the run — not the week — as the story.

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
    `:1443`; *(the two credit-duration clamps are GONE, §9.13-CREDIT rows 1 and 3: `07b:110-119`
    blended an issuer's whole ladder into one duration × 0.75 clamped [1,8] and `07d:86-88` took a
    stated 5-year tenor × 0.7 clamped [1,4], and there is nothing left for either to be the duration
    OF — every schedule is struck on the paper's own remaining life. That life is its MATURITY, and
    deriving Macaulay duration off the same cash flows is what this step still owes; both books now
    hold those cash flows.)* `stage08-back.ts:970` (a payout ratio
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
    longer exists. Delete all of it, and every comment that still describes a boundary the model no
    longer has. *(The dead-FILE half is done — §9's dead-file sweep. `engine2/state.ts` and
    `stages/register-index.ts` were the sweep's two corrections: both have real importers and the
    audit's claim that they had none was stale.)* **AND THE DEAD EXPORTS**, measured by the same
    sweep: **369 exported names in 147 files appear in no other file** — over-exported internals
    for the most part, dead constants for the rest. It is a mechanical pass (drop the `export`, or
    the name, and let `tsc`/`eslint` say), and it belongs here rather than in a step of its own.
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
    (07c/07f retire the unplaced face). A treasury CAN fail to place its debt here.

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
25. **A CURVE POINT SAYS WHETHER IT WAS TRADED OR INTERPOLATED.** *(The two-owners half is DONE —
    §9.13-SOV row 5. `sovereign-curve.ts` fits once through every cleared point and publishes every
    field as a read of it, and `P6` is now the guard on that rather than a measurement of it.)*
    What is left is the atlas's D3.b, one level down: `calculateNelsonSiegelZeroRate` is called at
    15 sites to produce a rate for a tenor nobody traded — a coupon at `11-fiscal`, a make-whole
    discount at `call-protection.ts:96`, a refinancing's fair rate at `stage08-back.ts:1432` — and
    **no consumer can tell an interpolated point from a cleared one, because the return type is a
    number.** A fitted curve should hand back points that carry their own provenance, so a
    mechanism that must not price off an invented point can say so.
26. **The remaining formula prices, deleted — and WHAT PLANT IS, decided once.** *(11e's last
    slice folded in here, deliberately: the seed and every birth assign `grossPPEUSD` with no
    wire and there is no asset kind for plant — `ASSET_KINDS` carries `HOUSE`, not plant. You
    cannot wire a thing before deciding what it is, and the shape is exactly what the two
    disagreeing depreciation schedules below are a symptom of: `capexUnderConstruction` already
    carries plant as a stack of DATED vintages while the sheet carries it as one number. Decide
    it once, here, and the wire follows; deciding it twice guarantees they diverge again.)* `12-portfolio:141` re-derives a bond price from the
    cleared OAS through Nelson-Siegel (a round trip that cannot return the cleared price — and it is
    the ONLY caller of `engine/pricing.ts:priceCorporateBond`/`priceLeveragedLoan`, so both die with
    it) and splits
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

37-BANKEQUITY. **A BANK CANNOT RAISE CAPITAL, AND IT HAS ONE LAYER OF IT.** (banks-capital
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

37-MANDA. **THERE IS NO M&A MARKET. THERE IS A COIN FLIP.** (m-and-a B5/B2/B2.a/B3/B4/C1/C2/C3,
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
    reads. Step 24 (labour clears on the wage) needs it — a bid for labour is a bid for a
    contract — and 37-SMALL's labour C2/C3 lands on it. Medium; after 37-MANDA, which is the
    largest consumer of a transfer of employees.

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
    · **short-term-debt B4** — a committed backstop is free, with no commitment fee on undrawn
      headroom *(A2/E2 and sovereign-credit F2, listed here before, closed at §9.13-BILL)*;
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
      own comment that it measures something else;
    · **derivative D10.a, cds E2** — no reservation in any of the four books carries a term for the
      COUNTERPARTY, so a weak dealer never loses flow and wrong-way risk can cost nobody anything;
    · **banks-capital D3.b/D6** — the assuming bank is assigned, not choosing: its bid IS
      `estateLocal`, and a resolution with no bid falls through to the public path that exists;
    · **banks-funding D4/D4.a, banks-lending B2.b** — origination is gated by capital alone, so a
      bank out of cash and collateral writes the same book as one flush with reserves;
    · **fx-forwards B3/C4** — `evolveFxPair` still walks a second cross-currency basis the player
      trades against; delete the line and point every reader at `reg.crossCurrencyBasisBps`;
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

A finished step leaves §3 and lands here as ONE ENTRY, newest first (rule 16 says how long): what
changed, why, and the measured numbers. The long-form record it was compressed from is `docs/LOG_ARCHIVE.md` — reasoning, not
governance. Violation counts are 4 weeks / `SHOCKS=0` unless the line says otherwise, and after
rule 11 they are step 38's to move, not a step's.

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
