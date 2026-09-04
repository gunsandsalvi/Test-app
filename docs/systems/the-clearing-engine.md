# SYSTEM: THE CLEARING ENGINE

The mechanism every market in this world shares: participants post what they will do at what
price, the mechanism finds where those meet, and what comes out is a price and a set of trades.
Rule 1 lives here — *every price is cleared* — so this tree is the contract each market tree
(`corporate-credit.md`, `equity.md`, `goods.md`, `fx-spot.md`, …) is measured against.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A MARKET IS
- **A1** REASON — a market is **two or more parties with different reasons** to want the same
  thing at different prices
  - A1.a the differences are the market; identical participants have nothing to trade
- **A2** REASON — each participant posts a **schedule**, not a point: how much at each price
  - A2.a because a single number cannot answer "and if it were cheaper?", which is the only
    question the mechanism asks
- **A3** REASON — the schedule comes from the participant's **own state**: its position, its cost
  of funds, its mandate, its view, its constraints
- **A4** FORBID — **no participant is a price-taker of a price this mechanism has not yet
  produced.** A schedule written against the clearing price is the answer smuggled into the input

### B. WHO IS IN THE ROOM
- **B1** REASON — the participants are **named parties** with balance sheets that will actually
  change
- **B2** REASON — a party is present **because it has a reason to be**: a maturity to roll, a
  mandate to fill, an inventory to shed, a view
- **B3** REASON — a **dealer** may be there, and its reason is inventory and spread
  (`dealer-desks.md`), which is a reason like any other
  - B3.a it has a **limit**: capital, risk, inventory. A dealer without a limit is a synthetic
    counterparty wearing a dealer's name
- **B4** FORBID — **no buyer of last resort by construction.** No participant exists whose
  schedule is "whatever is left, at whatever price". The central bank is a participant with a
  policy reason and a stated facility (`the-central-bank.md` D), never a residual absorber
- **B5** FORBID — **the mechanism does not add demand to make itself clear.** If it did, the
  price it produces is a fixed point of its own patch, and rule 3 is satisfied in letter only

### C. THE CLEARING
- **C1** REASON — the mechanism finds the price where **posted supply meets posted demand**
- **C2** REASON — the price is **discovered, not assigned** — it is a root of the schedules, and
  changing an input must be able to change it
- **C3** REASON — quantity is **rationed** when the two sides are unequal at the clearing price,
  by a stated rule (pro rata, priority, time)
- **C4** REASON — **it can fail to clear.** No overlap is a real outcome
  - C4.a a failed auction has consequences: the issuer does not get its money, the seller keeps
    its inventory, the maturity is not rolled — and those consequences propagate
  - C4.b failure must be **representable and observable**, not an exception path that quietly
    substitutes a price
- **C5** VERIFY — the clearing price is a **function of the schedules alone**; feed the same
  schedules twice and get the same price

### D. WHAT COMES OUT
- **D1** REASON — a **price**, in a stated unit, for a stated instrument, at a stated time
  - D1.a price is the primitive; yield, spread, OAS, discount margin are **derived from it**
    (rule 3), and never the other way round
- **D2** REASON — a set of **trades**, each with two named sides and a quantity
- **D3** REASON — the trades hit the **register and the accounts** in the same pass (rule 5,
  `the-register.md` C3)
- **D4** REASON — the price becomes the **mark** for everyone holding that instrument, and the
  revaluation is real money to somebody
- **D5** VERIFY — Σ bought = Σ sold, and Σ cash paid = Σ cash received, per clearing

### E. THE PRINT AND WHAT IT MEANS
- **E1** REASON — the price is **public**: other participants and other markets can see it
- **E2** REASON — one market's print is another's **input** — a bond print moves a CDS, an equity
  print moves a merger, a policy rate moves everything (`the-derivative-layer.md`, `indices.md`)
- **E3** REASON — the **bid–offer is a consequence** of what dealers post, read off the schedules;
  it is never a prior applied to a mid
- **E4** VERIFY — a market with no trades has **no new print**, and the stale mark must be visibly
  stale rather than silently refreshed

### F. ORDER AND TIME
- **F1** REASON — a market clears at a **stated point in the week**, and what it can see is what
  has already happened
  - F1.a a market that needs a number produced later in the same week is in the wrong place —
    that is an ordering defect, and the fix is the order, not a forward reference
- **F2** REASON — a **rate in force for the week is one rate**: a participant cannot value at one
  and settle at another (see `currency-and-fx.md` D)
- **F3** VERIFY — moving a market earlier or later changes results; if it does not, it is not
  reading anything the rest of the week produces

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 two or more parties with different reasons | `src/engine/simulation/stages/financial-clearing-engine.ts:ClearingParticipant` | ✅ |
| A1.a the differences are the market | `src/engine/simulation/stages/financial-clearing-engine.ts:anyCeilingAboveHolding` | ✅ |
| A2 each participant posts a schedule, not a point | `src/engine/simulation/stages/financial-clearing-engine.ts:ParticipantDemand` | ✅ |
| A2.a a single number cannot answer "and if it were cheaper?" | `src/engine/simulation/stages/financial-clearing-engine.ts:setDemand` | ✅ |
| A3 the schedule comes from the participant's own state | `src/engine/simulation/stages/dealer-desks.ts:buildDealerDeskParticipants` | ✅ |
| **A4 FORBID no price-taker of a price not yet produced** | `src/engine/simulation/stages/etf-demand.ts:indexFundDemand` | ⚠️ |
| B1 the participants are named parties with balance sheets | `src/engine/simulation/stages/book-settlement.ts:settleClearedBook` | ✅ |
| B2 a party is present because it has a reason to be | `src/engine/simulation/stages/central-bank-demand.ts:centralBankParticipant` | ✅ |
| B3 a dealer may be there; its reason is inventory and spread | `src/engine/simulation/stages/dealer-desks.ts:buildDealerDeskParticipants` | ✅ |
| B3.a a dealer has a limit: capital, risk, inventory | `src/domain/dealer-desk.ts:dealerDeskCapacityLocal` | ✅ |
| **B4 FORBID no buyer of last resort by construction** | `src/engine/simulation/stages/financial-clearing-engine.ts:unsoldStaysWithHolder` | ✅ |
| **B5 FORBID the mechanism does not add demand to make itself clear** | `src/engine/simulation/stages/financial-clearing-engine.ts:solveClearingStat` | ⚠️ |
| C1 the price where posted supply meets posted demand | `src/engine/simulation/stages/financial-clearing-engine.ts:solveClearingStat` | ✅ |
| C2 the price is discovered, not assigned | `src/engine/simulation/stages/financial-clearing-engine.ts:runClearingKernel` | ⚠️ |
| C3 quantity is rationed by a stated rule | `src/engine/simulation/stages/financial-clearing-engine.ts:runClearingKernel` | ✅ |
| **C4 it can fail to clear** | `src/engine/simulation/stages/double-auction.ts:emptyAuctionResult` | ⚠️ |
| C4.a a failed auction has consequences that propagate | `src/engine/ledger/tranche-ledger.ts:retireTranche` | ✅ |
| **C4.b failure is representable and observable, not a quiet substitute** | `src/engine/simulation/stages/financial-clearing-engine.ts:solveClearingStat` | ❌ |
| C5 VERIFY the price is a function of the schedules alone | `src/engine/simulation/stages/financial-clearing-engine.ts:sortIndexByKey` | ✅ |
| D1 a price, in a stated unit, for a stated instrument | `src/engine/simulation/stages/financial-clearing-engine.ts:ClearingResult` | ✅ |
| D1.a price is the primitive; yield and spread are derived | `src/engine/simulation/stages/financial-clearing-engine.ts:ClearingInstrument` | ❌ |
| D2 a set of trades with two named sides and a quantity | `src/engine/ledger/holdings-ledger.ts:clearedBookDelta` | ✅ |
| D3 the trades hit the register and the accounts in the same pass | `src/engine/simulation/stages/book-settlement.ts:settleClearedBook` | ⚠️ |
| D4 the price becomes the mark for every holder | `src/engine/ledger/holdings-ledger.ts:markBookToMarket` | ✅ |
| D5 VERIFY Σ bought = Σ sold, Σ cash paid = Σ cash received | `src/engine/simulation/stages/settlement.ts:clearingHouseResidualLocal` | ✅ |
| E1 the price is public | `src/engine/simulation/stages/07b-corporate-bond-clearing.ts:runCorporateBondClearingStage` | ✅ |
| E2 one market's print is another's input | `src/engine/simulation/stages/index-calculation.ts:runIndexCalculationStage` | ✅ |
| **E3 the bid–offer is a consequence, never a prior on a mid** | `src/domain/dealer-desk.ts:DESK_SPREAD_BPS_BY_BOOK` | ❌ |
| **E4 VERIFY no trades → no new print; a stale mark is visibly stale** | `src/engine/simulation/stages/financial-clearing-engine.ts:runClearingKernel` | ❌ |
| F1 a market clears at a stated point in the week | `src/engine/simulation/core.ts:advanceWeeklyStepProfiled` | ✅ |
| F1.a a forward reference is an ordering defect | `src/engine/simulation/stage-deps.ts:DELIBERATE_PIPELINE_FIELDS` | ✅ |
| F2 a rate in force for the week is one rate | `src/engine2/world.ts:openFxWeek` | ✅ |
| F3 VERIFY moving a market earlier or later changes results | `src/engine/simulation/stage-deps.ts:StageDependencyTrace` | ⚠️ |

---

## 3. THE DIFF

### ✅ B4 / B5 — THE AUCTIONS ARE CLEAN, VERIFIED INDEPENDENTLY

§3 step 20-LLR asserts this; read fresh today, it holds, and the evidence is worth pinning because
the node is a FORBID and the code cannot volunteer it.

**No participant's schedule is "whatever is left, at whatever price."** Every schedule is a
`ParticipantDemand` with a reservation level and a size, and the two participants that are
price-INSENSITIVE are still SIZE-bounded, by a quantity decided outside the auction: the central
bank posts `reservationStat: ±NO_RESERVATION_STAT` (the sign is the book's kind — §3.13-SOV row 4
made it so, since in price space always-in-the-money is a HIGH reservation) with
`maxNetPurchaseUSD: orderUSD`, where
`orderUSD` is `plannedPurchasesByBond` (`central-bank-demand.ts:41,48`) — a policy quantity struck
before the book opens and unable to respond to weak demand; an index fund the same with
`maxNetPurchaseUSD: availableCashUSD` (`etf-demand.ts:37-51`). Neither size is a residual.

**The five stock books hand nothing to a residual dealer.** `unsoldStaysWithHolder: true` at
07b:482, 07c:504, 07d:440, 07e:456, 07f:354 and 07f:905; in the kernel that switch rations BOTH
sides against each other (`financial-clearing-engine.ts:855-864`) and then sets
`dealerInventory = 0` outright (`:887`). A seller that finds no buyer keeps its paper.
`book-settlement.ts:27-32` records that the corresponding UNMODELED funding leg was deleted, and
its `leftoverUSD` defect (`:110`) is the standing guard that it stays deleted.

**The desks are bounded participants, not a backstop.** `dealerDeskCapacityUSD`
(`domain/dealer-desk.ts:122-135`) is the min of a share of the equity-supported balance sheet less
what the bank's other desks already hold, and the leverage headroom; a full desk quotes nothing.
A desk is additionally cash-bounded by its reserves above the buffer
(`dealer-desks.ts:118-121`).

**And a deal is pulled.** `runClearingKernel:775-784` re-solves without the offering when the
level clears past `primaryWithdrawStat`, and 07c/07f retire the unplaced face off the bond's own row (`retireTranche`) — sovereign paper
that did not place.

**One qualification 20-LLR does not make.** The residual dealer still exists on the FLOW books
(`unsoldStaysWithHolder` off): `dealerInventory = liveFloatUSD − allocatedUSD` (`:889`). On repo,
securities lending, ETF flows and the goods-adjacent books nobody settles it — it is read as a
measurement, which is what the parameter's doc says it is for. **`fx-clearing.ts:353` is the
exception**: it takes the whole residual and assigns it as the desks' net position
(`dealerLongBaseByPair = −sign × |residualUSD|`) with no capacity test on the way in, so the
unmet flow becomes somebody's book by construction after the price has been struck. The price is
not affected — but the position is a residual absorber, and it belongs to `fx-spot.md` /
`dealer-desks.md` to name. Recorded here as the one place B4's shape survives.

### ❌ C4.b / ⚠️ C4 / C2 — THE FINANCIAL SOLVE IS A TOTAL FUNCTION AND INVENTS A PRICE WHEN NONE EXISTS

`solveClearingStat` returns `number`. It has no way to say "did not clear", so on the two inputs
where no clearing level exists it returns a bracket bound:

- `financial-clearing-engine.ts:444` — `if (demandAtU(uLo) > targetUSD) return toStat(uLo);` prints
  `bracketLow`, which is **−2000 bps** for a YIELD_LIKE book or 1% of last week's price for a
  PRICE_LIKE one (`:747`);
- `:494` — `return toStat(uHi);` prints `bracketHigh`, **100,000 bps** or 100× last week's price
  (`:748`), reached when the segment walk finds no crossing at all.

Both bounds go straight onto the books: `comp.oasSpreadBps = result.newStatByIndex[ii]`
(`07b-corporate-bond-clearing.ts:507`), and from there into the curve, the marks and every derived
statistic. There is nothing between the bracket and the print — `:788-793` records the user's own
instruction that there is no cap, which was right about caps and leaves the bound reaching the
books directly.

**The saturation retreat is not the fix and is not the defect.** `:443`
`targetUSD = min(float, demandAtWideEnd × 0.999999)` handles a book whose demand cannot ABSORB the
float — that is a real market state and the retreat is the honest answer to it. It cannot handle a
book with NO demand, because there is no level to retreat to.

**Contrast with the other auction in the tree, which gets this right.** `clearDoubleAuction`
returns `emptyAuctionResult(anchorPrice)` with `clearedQuantity: 0` when there are no bids, no
offers, or no overlap (`double-auction.ts:95,140`) — a representable no-trade, and the anchor is
explicitly *"not a bound the solve is allowed to return as a result"*. The goods markets can fail
to clear; the financial markets cannot.

**Already §3 step 21 / 21-BRACKET**, which has already MEASURED it: 67 tight and 139 wide prints
over the 16-week reference, growing monotonically. This tree adds one thing to that step — the
node it violates is C4.b, and the reason a code sweep never found it is that a total function has
no line at which it declines to answer.

### ❌ E3 — THE BID–OFFER IS A TABLE

`DESK_SPREAD_BPS_BY_BOOK` (`domain/dealer-desk.ts:56-68`) is eight stated real-market widths —
sovereign 5, bill 2, corporate 15, loan 20, equity 8, FX 2. It reaches the auction two ways: as
`ClearingParams.dealerSpreadBps`, charged on every fill as a fee, and as the desks' own
`fullSizeStatRange` (`dealer-desks.ts:152-156`), where the desk's reservation is
`currentStat ± neutralFraction × spreadBps`. So the quote width is a prior applied to last week's
mid, which is the exact construction E3 forbids, and the desks' schedules — the thing the node
says the spread should be READ OFF — are built from it instead.

**Already §3 step 26** (`dealer-desk.ts:117` is on its list). Second witness, with the mechanism
named: it is not only a cost charged, it is the shape of the desks' curve.

### ❌ E4 — A MARKET WITH NO TRADES STILL PRINTS, AND THE STALENESS IS INVISIBLE

`runClearingKernel:739-743`: when `packed.skip[i]` (nothing to sell) the kernel writes
`out.clearedStat[o] = currentStat` and moves on. Downstream that is indistinguishable from a
level the book actually solved — `newStatByIndex` carries no "did not trade" flag, and neither
does `ClearingResult`. The same is true of the bracket prints above and of `double-auction`'s
anchor: last week's number is re-published as this week's print.

The only staleness instrument in the engine is `damperBoundInstrumentIds`, which measures a
different thing (a level held away by the damper) and is fed by a damper the file's own comment
at `:788` says no longer exists.

**Becomes a §3 step**, and it is the same signature change as 21-BRACKET: once the solve returns
whether it cleared, "no new print" is the same fact and the flag is free. Recommend folding it
into 21-BRACKET rather than opening a second step.

### ❌ D1.a — THE ENGINE'S PRIMITIVE IS A STATISTIC, NOT A PRICE

`ClearingInstrument.statKind` is `'YIELD_LIKE' | 'PRICE_LIKE'`, and the credit books all run
YIELD_LIKE: what the auction solves for and prints is a SPREAD, and the price (if any reader wants
one) is derived from it afterwards. D1.a says price is the primitive and spread is derived from
it — the engine has the arrow the other way round for every credit instrument in the model.

**Already §3 step 13**, which is exactly this reversal. Recorded here because the clearing tree is
where the arrow is actually decided: `statKind` is the field that has to go.

### ⚠️ A4 / D3 / F3 — THREE NODES THAT ARE NEARLY RIGHT

**A4**: no schedule is written against this week's clearing price — every reservation is anchored
on `inst.currentStat`, last week's print. The `⚠️` is for the price-insensitive participants
(index funds, the central bank): they are not price-takers of a price not yet produced, they are
price-takers of ANY price, which the node does not forbid but which is what makes 21-BRACKET's
tight bound reachable.

**D3**: the trades hit the register at `holdings-writeback` (`core.ts:292`) and the accounts at
`settlement` (`core.ts:308`) — the same week, two stages. See `the-register.md` C3.

**F3**: `StageDependencyTrace` measures which orderings are load-bearing and fails the run on an
unannotated backward edge, which is the right instrument. What it does not do is F3's actual test —
move a market and see whether results change — so no book has been shown to read anything the rest
of the week produces. **A measurement, for §3 step 38.**
