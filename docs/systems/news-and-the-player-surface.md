# SYSTEM: NEWS AND THE PLAYER SURFACE

What the world exposes to somebody looking at it: prints, events, positions, and the actions that
can be taken. It is the last tree because it depends on all the others — but it is a required tree
and not a presentation detail, because **what can be observed and what can be acted on are part of
the model.**

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT AN OBSERVER CAN SEE
- **A1** REASON — **prints**: prices that cleared, with their instrument, time and unit
  (`the-clearing-engine.md` E1)
  - A1.a and a **stale mark must be visibly stale** (`the-clearing-engine.md` E4): a screen that
    shows a price without saying when it traded is misinformation
- **A2** REASON — **its own positions and balances**, exactly as the register and the accounts hold
  them (`the-register.md` D1, `money-and-settlement.md`)
- **A3** REASON — **public state**: what an issuer has published, what a central bank has decided,
  what a rating agency has said (`ratings-and-assessment.md` A1)
- **A4** FORBID — **no observer sees another party's private state.** Positions, intentions and
  limits are private, and a surface that exposes them makes the market a solved game
- **A5** REASON — **aggregates that are genuinely published** — indices, official statistics
  (`indices.md`) — with the lag and the revision that real statistics have
  - A5.a a statistic available instantly and exactly is not a statistic, it is the model's
    internals

### B. WHAT AN EVENT IS
- **B1** REASON — a **change of state that somebody would notice**: a default, a downgrade, a
  policy move, a large print, a failed auction (`the-clearing-engine.md` C4.b)
- **B2** REASON — it **describes something that actually happened in the state**, and it is
  generated FROM the state
  - B2.a FORBID — **news never causes anything.** An event that moves a price directly is an
    exogenous shock with a headline attached; the price moves because participants acted
    (`the-clearing-engine.md`), and the event is the report of it
- **B3** REASON — it has a **time and named subjects**, so it can be checked against the state
- **B4** REASON — it can be **wrong or incomplete** in the same way real reporting is, but it may
  never be **invented**

### C. WHAT AN ACTOR CAN DO
- **C1** REASON — the actions available are the ones **any participant has**: post a schedule,
  trade, lend, borrow, hedge, hold
  - C1.a acting means **entering a market that must clear** — the price is not the actor's to set
    (`the-clearing-engine.md` C2)
- **C2** REASON — an action **requires the means**: cash in the right currency, the holding to
  sell, the borrowing capacity, the collateral
  - C2.a FORBID — **no privileged actor.** Nobody transacts without the balance, outside the
    mechanism, or at a price that did not clear. A surface that lets its user do so is measuring a
    different world from the one it is displaying
- **C3** REASON — an action has **consequences that propagate** exactly like anyone else's
- **C4** REASON — the actor is a **named party in the register and the accounts**, and it appears
  in every audit family like the rest (`the-audit.md`)

### D. THE RECORD
- **D1** REASON — a **history** that is a read of what happened, not a separate log that can drift
  (rule 4)
- **D2** REASON — **performance is computed from real positions and real prices**, so it can be
  bad
- **D3** VERIFY — anything shown must be reproducible from the state; a number on the surface with
  no derivation behind it is a number invented for display

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no display-only number.** If it is worth showing it is worth deriving, and if
  it cannot be derived it must not be shown
- **E2** FORBID — **no scripted narrative.** A sequence of events written in advance is rule 2's
  defect at the level of the whole world
- **E3** FORBID — **no surface that changes the model.** Observing must not move anything; if
  looking at a market changes it, every measurement in this atlas is contaminated

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 prints: prices that cleared, with instrument, time and unit | `src/domain/calendar.ts:dateOfWeek` | ✅ |
| A1.a a stale mark must be visibly stale | `src/ui/objects/market.tsx:totalUnitsDemandedThisWeek` | ⚠️ |
| A2 its own positions and balances, as the register holds them | `src/ui/functions/holders.tsx:CompanyHolders` | ⚠️ |
| A3 public state: issuer, central bank, rating agency | `src/ui/objects/centralbank.tsx:centralbank` | ✅ |
| **A4 FORBID no observer sees another party's private state** | `src/ui/functions/diag.tsx:diag` | ❌ |
| A5 published aggregates, with lag and revision | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:inflationIsMeasured` | ⚠️ |
| A5.a a statistic available instantly and exactly is the internals | `src/ui/functions/macro.tsx:fxReservesLocal` | ❌ |
| B1 an event is a change of state somebody would notice | `src/engine/simulation/stages/news-derivation.ts:runNewsDerivationStage` | ✅ |
| B2 it describes something that happened, generated FROM the state | `src/engine/simulation/stages/news-derivation.ts:outflowsOf` | ✅ |
| **B2.a FORBID news never causes anything** | `src/engine/newsGenerator.ts:generateWeeklyNews` | ✅ |
| B3 it has a time and named subjects | `src/domain/events.ts:refs` | ✅ |
| B4 it can be wrong, but never invented | `src/engine/newsGenerator.ts:ratingChanges` | ❌ |
| C1 the actions are the ones any participant has | `src/engine/simulation/trade.ts:executeTrade` | ❌ |
| C1.a acting means entering a market that must clear | `src/engine/simulation/trade.ts:executionDetails` | ❌ |
| C2 an action requires the means | `src/engine/simulation/trade.ts:updatedCash` | ❌ |
| **C2.a FORBID no privileged actor** | `src/engine/simulation/trade.ts:adjustBankReserves` | ❌ |
| C3 an action's consequences propagate like anyone else's | `src/engine/simulation/stages/12-portfolio-and-positions.ts:runPortfolioAndPositionsStage` | ❌ |
| C4 the actor is a named party in the register and the accounts | `src/domain/party.ts:PartyRef` | ❌ |
| D1 a history that is a read, not a log that can drift | `src/ui/world.ts:Tape` | ⚠️ |
| D2 performance computed from real positions and real prices | `src/domain/portfolio.ts:Portfolio` | ❌ |
| D3 VERIFY anything shown is reproducible from the state | `src/ui/functions/statements.tsx:RegionStatements` | ⚠️ |
| **E1 FORBID no display-only number** | `src/ui/functions/macro.tsx:macro` | ❌ |
| E2 FORBID no scripted narrative | `src/engine/simulation/initialization.ts:newsFeed` | ⚠️ |
| E3 FORBID no surface that changes the model | `src/ui/world.ts:worldOf` | ✅ |

---

## 3. THE DIFF

### ❌ C1–C4 — THERE IS NO ACTOR. THE SURFACE IS AN INSPECTOR, AND THE OLD PLAYER IS DEAD CODE THAT WOULD BE PRIVILEGED IF IT WERE ALIVE

**Section C does not map, and the reason is structural rather than defective.** `src/ui/` is
Aurora, and `ui/world.ts:1-7` states its contract: *"THE WORLD, READ-ONLY … Nothing here writes
engine state."* Every one of its twenty-three functions renders; none of them acts. There is no
order ticket, no trade button, no path from a tap to a clearing book. So C1's "the actions
available are the ones any participant has" has an empty set on both sides.

Beside it, unreferenced, is the previous surface. `state.portfolio` (`domain/portfolio.ts`) is
cash, positions, NAV, margin and five-factor attribution; `12-portfolio-and-positions.ts` marks all
of it every week; `13-news-and-turn-summary.ts:26-40` rolls the NAV forward and writes a
`turnSummary` with a margin alert. And `engine/simulation/trade.ts:executeTrade` — the only thing
that could ever open a position — **has zero callers.** `grep -rn executeTrade src/` returns its
own definition and nothing else.

That matters because of what it would do if it were called. Three violations, in one function:

- **C2 / C2.a.** `trade.ts:31` is `const updatedCash = state.portfolio.cashLocal −
  (executionDetails?.spreadCostLocal ?? 0)`. The player pays **the spread and nothing else.** Buying
  a billion of bonds debits a few basis points of it; the notional never leaves the account. The
  means are not required, which is exactly C2.a's forbidden actor. Worse for rule 4 ("1$ is 1$"),
  the desk's side IS charged the notional — `adjustBankReserves(v2, bank.ticker,
  −inventoryDeltaLocal + incomeLocal)` at `:98` — so the bank pays for paper the buyer did not pay for,
  and the difference is money created at the ticket.
- **C1.a.** The fill price arrives as `executionDetails.fillPrice`, supplied by the caller. Nothing
  in the function enters a book, joins a queue, or clears. The price is the actor's to bring.
- **C4.** `domain/party.ts:PartyRef` has ten kinds — COMPANY, BANK, BANK_CREDIT,
  BANK_SECURITIES, CLEARING_HOUSE, INSTITUTION, SEGMENT, HOUSEHOLD, GOVERNMENT, CENTRAL_BANK — and
  **no PLAYER.** The portfolio has no account, no register rows, and appears in no audit family, so
  its positions are marked against companies it does not appear as a holder of. C3 follows: the
  consequences cannot propagate, because there is nothing on the other side to propagate to.

**MISSING and not OUT OF SCOPE.** The tree's premise is that what can be observed and acted on is
part of the model, and the model has kept the acting half as a vestige rather than deciding against
it. **§3 step 37-SURFACE**, and the shape of the step is the finding: an actor is a `PartyRef` kind
with an account and register rows, whose orders are ordinary participants in the books that already
clear — not a second position system beside them. §3 step 17b touches the edge of this (*"stage 12's
player options stay on the legacy layer instead of the one book, which is the last thing outside
it"*) but names only the options; the account, the party and the fill are not named anywhere.

### ❌ E1 / A5.a / ⚠️ D3 — DISPLAY-ONLY NUMBERS, AND ONE OF THEM IS A WHOLE SYSTEM

E1 forbids a number on the surface with no derivation behind it. Two on the region page have no
derivation at all — not a wrong one, none:

- **`currentAccountPctGdp`** — was seeded `0`, written by nothing, and rendered on the macro page
  and the region statement as a fact. **Deleted 2026-09-05 (§9.15-iii)**: the two screens show the
  trade balance as a share of GDP, which is a read of real fills; the current account itself is
  `cross-border.md` §3's absence and §3.37-BOP's to build as a read of the transactions.
- **`fxReservesLocal`** — `macro/initialization.ts:581` sets it to `estimatedNominalGdpLocal * 0.002`
  once, at the seed. No stage writes it. It is shown on the macro page and again on the central-bank
  page (`centralbank.tsx:64`). A central bank's reserves are a *position*, and this one has never
  moved and cannot.

Both are read by a person as facts about the world, which is what makes E1 a FORBID rather than a
style rule. A5.a is the same defect from the other side: what IS published is published instantly
and exactly, straight off the state object.

Rule 12: the cause is the missing mechanism, and it belongs in cross-border's step (37-BOP); 15-iii
took the display-only field off the surface and left the mechanism there. `fxReservesLocal` is named
nowhere and stays ❌ here; it wants a decision (a central bank with no reserves position is a
legitimate design — then delete the field rather than show it).

D3 is `⚠️` rather than `❌` because the surface is otherwise unusually good at this: `ui/world.ts`
reads through typed selectors off the register and the accounts (`householdDepositsOf`,
`bankReservesOf`, `treasuryAccountOf`, `facilityBookOf`), and `holders`/`holdings`/`ladder` render
register rows directly. The exceptions above are the exceptions.

### ❌ A4 — EVERY OBSERVER SEES EVERY PARTY'S BOOK

The surface is a full god-view and does not pretend otherwise. `functions/holders.tsx` shows every
holder of any company's equity and debt with sizes; `holdings` shows any institution's whole book;
`functions/lists.tsx` enumerates every bank, fund and pool; `functions/diag.tsx` shows which names
the damper bound in every book this week, with streaks — a *market-internals* view no participant
could have; `functions/statements.tsx` renders any firm's full financials; `objects/centralbank.tsx`
shows the treasury's overdraft.

Marked `❌` rather than OUT OF SCOPE, but with the reason stated, because the two answers are
different and this one is genuinely between them. **As an inspector, this is correct and is the
point** — §5-AU's depth rule (every identifier is a link) is what makes the model auditable, and
`the-audit.md`'s whole method depends on being able to see everything. **As a player surface it is
disqualifying**, and A4 says why: a market where one participant sees every other participant's
position and limits is a solved game.

They are not in conflict, they are two surfaces. The finding is that the model has one and calls it
both. Recorded as a **decision the C1–C4 step must make first**: an actor's view is a *filter* over
the inspector's, and building the actor without deciding the filter builds the solved game.

### ❌ B4 — THE OLD GENERATOR ASSERTS THINGS THAT ARE NOT SO

B2 and B2.a are in good shape and that is worth stating first. `news-derivation.ts` is a genuine
derivation: nine sections, each reading what the week's stages recorded, each citing `refs` the UI
resolves to objects, each carrying `materialityLocal`, and the deaths carry a `cause` traced through
the payment journal (`outflowsOf` walks `ctx.paymentJournal` for the payer's largest outflows by
reason). And B2.a holds across the whole model: `grep NewsItem src/` finds writers and the UI, and
**no mechanism reads the news feed.** `newsGenerator.ts:13-21` records the sentiment plumbing being
deleted; `macro/weather.ts` cuts a commodity's *supply* and lets the book price it, which is the
same discipline. Nothing moves a price because a story was written.

What fails is B4's second half — *may never be invented*. `newsGenerator.ts` still runs beside the
derivation (called from `11-fiscal:781`) and writes claims the state does not support:

- `:139` — every default prints *"Senior bond recovery established at 40%, equity shares
  cancelled."* The estate machinery computes a real recovery per claimant
  (`estate-resolution.ts:distribute`), and `news-derivation.ts:250` reports it correctly when the
  estate closes. So the model prints a stated 40% at the default and the real number weeks later,
  and they will not agree.
- `:157-159` — a downgrade's description is fixed prose: *"Downgrade triggered by rising leverage
  metrics, higher debt refinancing costs, and weakening operational EBITDA margins"*, for every
  downgrade, whatever caused it. `news-derivation.ts:150` writes the same event with the issuer's
  actual leverage, coverage, cash and cleared spread.
- `stage08-back.ts:1943-1951` picks one of three fixed `guidanceSnippet` strings by surprise sign
  and `newsGenerator:44` puts it in the headline as management's guidance.

Every one of these is a duplicate of a story the derivation already tells from the state — rule 4,
and the stated version is the wrong one. **Step 15b (News slice 2)** is the natural home
and is about developing stories, not this. **§3 step 37-SURFACE**: retire
`newsGenerator.ts` into the derivation (the rate-decision and weather items are the two it still
has that `news-derivation` does not).

### ⚠️ A1.a / A5 — LAG AND STALENESS EXIST IN ONE PLACE EACH, NOT AS A PROPERTY OF A PRINT

**A1.a.** A goods market says when it did not trade: `objects/market.tsx:100` renders *"no bids this
week"* when nothing cleared, off `totalUnitsDemandedThisWeek`. No financial print does. A bond, a
loan or an equity shows its last mark with nothing saying when it was struck — there is no
`lastClearedWeek` on an instrument anywhere in `src/` (`grep` finds none), so the surface could not
say it if it wanted to. That is a `the-clearing-engine.md` E4 gap as much as this tree's; recorded
here because this is where it misinforms.

**A5.** One real lag exists and it is the right kind: `11-fiscal:95` sets `inflationIsMeasured` only
once fifty-three real weeks have accrued, and until then the surface reports the level and says *"no
year of history yet"* (`news-derivation:320`). That is a statistic behaving like a statistic. It is
the only one. Nothing else is published with a lag, nothing is ever revised, and every other
aggregate is exact and instant. **A measurement and a design question rather than a mechanism gap**
— but the honest note is that A5.a is currently `❌` and A5 is `⚠️` only because CPI carries it
alone.

### ⚠️ D1 / E2 / ❌ D2 — THE RECORD

**D1** — `ui/world.ts:Tape` is a UI-side recorder for series the engine keeps only as a snapshot,
and its own header gives the reason (*"no engine state grows for a view"*). It is a separate log,
which is what D1 warns about, but it is a log of reads taken at week end rather than a parallel
account, and it cannot drift from the state because it never writes back. `⚠️`, and arguably the
right trade; recorded, not a step.

**D2** — performance is computed for a portfolio that has no positions anybody took (see C1–C4), so
it is real arithmetic over an actor that does not exist. It closes with C.

**E2** — one scripted item: `initialization.ts:1682-1691` seeds the feed with `init_welcome`,
*"Institutional Quant Trading Desk Initialized … Multi-region Nelson-Siegel curves, 200 corporate
issuers, 3 Dealer axes"* — a hard-coded issuer count and a hard-coded capital figure, dated with a
real-world date. It is one item and it is not a narrative sequence, so `⚠️` and not `❌`; it goes
with `newsGenerator.ts` in the same delete.

### ✅ E3 — OBSERVING MOVES NOTHING

`ui/world.ts` and every object and function module take `World` and return elements. No render path
mutates `GameState` or `V2World`; `recordTape` appends to the UI's own tape. The one place a surface
could have written the model — `executeTrade` — is never called. So the atlas's measurements are not
contaminated by being taken. (§9.15-v: one render did reach the engine's intern tables —
`statements.tsx` called `partyId` and `internReason`, which add a row on first sight; it now reads
through `ui/world.ts:unpaidTaxesOf`, on the read-only `partyIdOf` and `reasonIdOf`.)

**The shell (2026-09-05, §9.14-SHELL).** Not a node — the surface's own mechanics, recorded here because this is the tree the surface sits
in. Every long list renders through `ui.tsx:Table`, which caps at `TABLE_CAP` rows and says so
beneath them with the control that shows the rest; no caller slices (`screener.tsx`'s 400 with a
hint, `book.tsx`'s 60 and `index-object.tsx`'s 40 in silence, `contracts.tsx`'s 100 and `diag.tsx`'s
80 are gone). And the on-screen keyboard moves the command bar, not the page: `index.html` asks the
keyboard to overlay the page rather than resize it, and `Aurora.tsx:useVisualViewport` reads what
the keyboard did to the visual viewport — the shell counter-moves by its scroll offset and the bar
alone moves up by the keyboard's height. §9.15-i: a tranche is searchable from the bar by its
market name, its issuer and its class (`objects/tranche.tsx`), a class word alone (`bonds`,
`bills`, …) opens the screener over that class (`objects/index.ts:kindOfWord`, through the
module's `kindWords`), and a tranche has peers — its issuer's ladder, its class, all. §9.15-ii:
every fixed-income view (the tranche, its screener, the ladder, an institution's holdings) shows
the cleared PRICE and what it implies side by side — an OAS or discount margin on corporate
paper, a yield on a sovereign — through one read, `engine/credit-price.ts:paperQuoteOf`, off the
one price store; unprinted paper shows a dash, never par. §9.15-iv: ONE calendar —
`domain/calendar.ts` holds the epoch (week 0 = 1 January 2027, the user's rule) and both the
UI's date formats and the engine's news and filing labels read it; the engine's own start date,
a year earlier, is gone, and with it a dead second bond-name grammar. §9.15b-i: a workout is a
story that DEVELOPS — an open estate records its week (`domain/estate.ts:EstateWeek`: what the
waterfall paid each class, what was sold, to which peers) and `news-derivation.ts` tells it each
week between the default and the close, naming the buyers and what is still owed against what is
left. §9.15b-ii: an under-subscribed auction is an event a reader can see — the treasury records
the week's auction rung by rung (`region-macro.ts:lastAuction`, written by 07c and 07f through
`government.ts:recordPrimaryOffering`), the story names the rungs that came up short and the
account's state, the ladder view shows the last auction, and a failed CP roll's story carries the
derived feed's refs, size and cause. §9.15b-iii: a party living on its bank is a story that is a
RUN — the close's overdraft sweep records who it swept (`banking.ts:rollOverdraftStreaks`, on
`GameState.overdraftStreaks`), and the feed tells the run when it becomes one and each time it
doubles, never the week.

### Also marked, briefly

- **A2 ⚠️** — every holder's positions render as the register holds them; "its own" has no referent because there is no actor — C1–C4.
- **C1.a ❌** — nothing enters a book: `executeTrade` takes its fill price from the caller — C1–C4.
