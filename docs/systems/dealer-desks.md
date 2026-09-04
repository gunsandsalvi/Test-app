# SYSTEM: DEALER DESKS

The parties that quote both sides. Every market tree in this atlas has a node saying "a dealer may
be there, and its reason is inventory and spread" — this is that reason, written out. It is also
where the atlas's hardest FORBID lives: **a dealer is a participant with limits, never the
mechanism's residual absorber** (`the-clearing-engine.md` B4).

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A DEALER IS
- **A1** REASON — a **named party**, usually a bank's trading arm, with its own balance sheet
  inside a bank's (`banks-capital-and-resolution.md`)
- **A2** REASON — it **quotes a price at which it will buy and a price at which it will sell**,
  and it is willing to do either
- **A3** REASON — it holds **inventory**: what it has bought and not yet sold, and the reverse
- **A4** REASON — it makes money from the **spread** and loses money from the **inventory**, and
  the two are the whole business

### B. WHY IT QUOTES
- **B1** REASON — it expects **two-way flow**: buyers and sellers arriving at different times, so
  it earns the spread for bridging the time between them
- **B2** REASON — it has **information** from seeing the flow, and the information is worth
  something
- **B3** REASON — the client **pays for immediacy**: the alternative is waiting for a natural
  counterparty, which may not come
- **B4** FORBID — **it does not quote because the mechanism needs somebody to.** If a desk's
  schedule is derived from the residual imbalance, it is the buyer of last resort with a different
  name, and every price the mechanism produces is a fixed point of that patch

### C. HOW IT PRICES — THE SPREAD IS A CONSEQUENCE
- **C1** REASON — the quote comes from the desk's **own state**: its inventory, its cost of funds
  (`banks-funding-and-liquidity.md`), its risk limit, its view
- **C2** REASON — **inventory skews the quote.** Long already ⇒ it bids lower and offers lower,
  because it wants to sell
  - C2.a this is how a desk mean-reverts its book without anyone telling it to, and it is why
    order flow moves prices
- **C3** REASON — **risk widens the quote**: volatility, illiquidity, a position it cannot hedge
- **C4** REASON — **adverse selection widens it**: a client who knows more is expensive to face
- **C5** REASON — the **bid–offer is therefore the output** of C1–C4 (user, 2026-09-03: "the bid
  offer is a consequence, not a prior")
  - C5.a FORBID — **no spread applied to a mid.** A mid with a spread bolted on is a single price
    pretending to be two, and it cannot skew, widen, or refuse

### D. LIMITS — WHY AN AUCTION CAN STILL FAIL
- **D1** REASON — it has a **position limit** per instrument and in aggregate, set by its own risk
  function
- **D2** REASON — it has a **capital charge** on what it holds, and the charge is real
  (`banks-capital-and-resolution.md` C)
- **D3** REASON — it has a **funding cost** on the inventory, paid every week it holds it
- **D4** REASON — when a limit binds it **widens, shrinks its size, or stops quoting** — and
  stopping is a legitimate, representable state
  - D4.a which is precisely what makes `the-clearing-engine.md` C4 — a failed auction — possible.
    A market fails when the dealers step back, and the dealers step back for the reasons in D1–D3
- **D5** VERIFY — in a stress week, desk inventory, spreads and capital usage should all move
  together, and if spreads widen without inventory moving, the widening is imposed

### E. HEDGING AND THE REST OF THE BOOK
- **E1** REASON — it **hedges what it can**: a bond against a swap, a share against an index, an
  FX position against another client's
  - E1.a a hedge is a **trade with a counterparty**, not a reduction in a number
    (`the-derivative-layer.md` B3.a)
- **E2** REASON — the hedge is **imperfect**, and the residual is basis risk it carries
- **E3** REASON — desks **face each other**: an interdealer market exists, and it is where
  inventory gets redistributed (`fx-spot.md` D2)
- **E4** VERIFY — Σ dealer inventory across desks = the position the rest of the world does not
  hold; it is a real number, and it should move with client flow

### F. WHAT MUST NOT HAPPEN
- **F1** FORBID — **no infinite balance sheet.** Every desk's capacity is finite and enumerable
- **F2** FORBID — **no desk that is exempt from its own bank's capital and funding**
- **F3** FORBID — **no desk whose P&L is the spread times volume.** Its P&L is the spread earned
  **minus** what the inventory did, and a desk that cannot lose money is not taking the other side

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a named party, a bank's trading arm with its own sheet inside a bank's | `src/domain/dealer-desk.ts:dealerDeskParticipantId` | ✅ |
| A2 it quotes a buy price and a sell price, and will do either | `src/engine/simulation/stages/dealer-desks.ts:buildDealerDeskParticipants` | ⚠️ |
| A3 it holds inventory | `src/domain/dealer-desk.ts:DealerDeskInventory` | ✅ |
| A4 it earns the spread and loses on the inventory | `src/engine/simulation/stages/dealer-desks.ts:applyDealerDeskFills` | ✅ |
| B1 it expects two-way flow arriving at different times | `src/domain/dealer-desk.ts:DealerDeskPosition` | ✅ |
| B2 it has information from seeing the flow | — | ❌ |
| B3 the client pays for immediacy | `src/engine/simulation/stages/book-settlement.ts:settleClearedBook` | ⚠️ |
| **B4 FORBID it does not quote because the mechanism needs somebody to** | `src/domain/dealer-desk.ts:dealerDeskCapacityLocal` | ✅ |
| C1 the quote comes from the desk's own state: inventory, funds, limit, view | `src/engine/simulation/stages/dealer-desks.ts:neutralFraction` | ⚠️ |
| C2 inventory skews the quote | `src/engine/simulation/stages/dealer-desks.ts:priorPositions` | ✅ |
| C2.a it mean-reverts its book without being told to | `src/domain/dealer-desk.ts:regionalDeskView` | ✅ |
| **C3 risk widens the quote** | `src/domain/dealer-desk.ts:DESK_SPREAD_BPS_BY_BOOK` | ❌ |
| **C4 adverse selection widens it** | — | ❌ |
| **C5 the bid–offer is the OUTPUT of C1–C4** | `src/domain/dealer-desk.ts:DESK_SPREAD_BPS_BY_BOOK` | ❌ |
| **C5.a FORBID no spread applied to a mid** | `src/engine/simulation/stages/financial-clearing-engine.ts:clearFinancialAsset` | ❌ |
| D1 a position limit per instrument and in aggregate | `src/domain/dealer-desk.ts:dealerDeskGrossLocal` | ✅ |
| D2 a capital charge on what it holds, and it is real | `src/engine/macro/banking.ts:bankTotalAssetsLocal` | ✅ |
| D3 a funding cost on the inventory, paid every week it holds it | `src/engine/macro/banking.ts:leverageHeadroomLocal` | ⚠️ |
| **D4 when a limit binds it widens, shrinks size, or stops quoting** | `src/domain/dealer-desk.ts:DEALER_DESK_SHARE_OF_BALANCE_SHEET` | ⚠️ |
| **D4.a which is what makes a failed auction possible at all** | `src/engine/simulation/stages/financial-clearing-engine.ts:clearFinancialAsset` | ✅ |
| D5 VERIFY in a stress week inventory, spreads and capital move together | — | ❌ |
| E1 it hedges what it can | `src/engine/simulation/stages/fx-clearing.ts:runFxClearingStage` | ⚠️ |
| E1.a a hedge is a trade with a counterparty, not a reduction in a number | `src/domain/dealer-derivatives.ts:FxDealerBook` | ✅ |
| E2 the hedge is imperfect, and the residual is basis risk it carries | — | ❌ |
| E3 desks face each other — an interdealer market exists | `src/engine/simulation/stages/fx-squaring.ts:squareInterbankFxPositions` | ⚠️ |
| E4 VERIFY Σ desk inventory = what the rest of the world does not hold | `src/engine/audit/ownership.ts:o1` | ⚠️ |
| F1 FORBID no infinite balance sheet | `src/domain/dealer-desk.ts:dealerDeskCapacityLocal` | ✅ |
| F2 FORBID no desk exempt from its own bank's capital and funding | `src/engine/simulation/stages/dealer-desks.ts:sheetOf` | ✅ |
| F3 FORBID no desk whose P&L is the spread times volume | `src/engine/ledger/bank-book.ts:bookPnL` | ⚠️ |

---

## 3. THE DIFF

### ❌ C5 / C5.a / C3 / C4 — THE BID–OFFER IS A CONSTANT TABLE, AND IT IS CHARGED AS A FEE ON A MID

**Verified, and it is worse than a per-book constant.** `domain/dealer-desk.ts:117`:

```ts
export const DESK_SPREAD_BPS_BY_BOOK: Record<string, number> = {
  'sovereign bond': 5, bill: 2, 'commercial paper': 5, 'corporate bond': 15,
  'leveraged loan': 20, equity: 8, commodity: 15, derivatives: 20, fx: 2,
};
```

Nine literals, and its own comment admits what they are: *"the tightest market there is"*,
*"loan secondary markets trade wider than investment grade"* — real-world observed levels, which
rule 2 forbids and rule 2 counts as a primitive. They do **two** jobs, and both are the node's
forbidden shape:

1. **A fee on the mid.** Each book passes the constant into the clearing engine as
   `dealerSpreadBps` (`07b:479`, `07c:501`, `07d:437`, `07e:453`, `07f:351,902`), and
   `financial-clearing-engine.ts:872` charges every participant
   `feeLocal = |tradedLocal| × (dealerSpreadBps / 10000)` **on top of the single cleared price**. That
   is C5.a verbatim: one price with a spread bolted on. The client pays it whether a desk was on
   the other side or not, and it cannot skew, widen, or refuse.
2. **The width of the desk's own schedule.** `dealer-desks.ts:150` sets
   `range = isYieldLike ? max(1, spreadBps) : currentStat × spreadBps/10000` and then
   `reservationStat = currentStat ± neutralFraction × range`. So the distance the level must travel
   for a desk to go from flat to full is the same constant.

**And the fee does not reach the desk that earned it.** `book-settlement.ts:117-125` splits
`dealer.feeLocal` across `feeDesksForRegion`, which is *every bank in the region pro rata by
`bankMarketShare`* (`:131`) — an assigned share, which is rule 2's own anti-pattern. A bank whose
desk took no position at all collects fee income proportional to its size.

**Consequences, in order of size.**
- **C3 and C4 have no mechanism** (`❌` both). Volatility, illiquidity, an unhedgeable position and
  an informed client change nothing: the quote is `constant`, always. A desk cannot charge more for
  a name it cannot get out of.
- **D5 cannot be measured and cannot be true** (`❌`). The node asks that in a stress week
  inventory, spreads and capital usage move together, *"and if spreads widen without inventory
  moving, the widening is imposed"*. Here spreads never widen at all — the failure mode is the
  opposite one, and it is invisible for the same reason.
- **D4 is half-present** (`⚠️`). A full desk shrinks its size and stops quoting
  (`dealerDeskCapacityLocal` returns 0), which is two of the node's three responses; **widening is
  the one it cannot do**, because the width is not the desk's.
- **F3 is diverging** (`⚠️`). The desk's own P&L is honestly built — `applyDealerDeskFills:274`
  computes `residualLocal = cashDeltaLocal + (newLocal − prevMarkedLocal)` plus `markToMarketLocal`, both
  booked through `bookPnL`, so a desk genuinely loses money on inventory. But the fee income
  running beside it *is* spread × volume, paid by market share, and it is not what any desk earned.

**Already §3 step 26**, which names it precisely: *"`dealer-desk.ts:117` charges a stated
real-market spread table as a real cost in five books."* Two things this tree adds that step 26's
line does not say: the table is used in **nine** places, not five (add `fx` in `fx-funding.ts:46`
and `05-unit-bidding.ts:2126,2220`, and `derivatives`), and it is not only a *cost* — it is also
the **width of every desk's schedule**, so deleting it as a fee still leaves C5 unanswered. The
replacement has to be a quote: two prices out of inventory, funding cost, risk and adverse
selection, with the fee being what the client actually crossed.

### ✅ B4 / D4.a / F1 — THE HARDEST FORBID IN THIS TREE IS SATISFIED

Stated plainly because it is the atlas's own test of this system and it passes.

A desk is an **ordinary participant**: `buildDealerDeskParticipants` posts a schedule into the same
auction as everyone else, its size is `dealerDeskCapacityLocal` — a share of the balance sheet its
own equity supports, less what its other desks already carry, floored by the leverage headroom —
and its cash is `bankReservesOf` above the bank's own deposit buffer. It is **not** derived from
the residual imbalance: the flow books pass `unsoldStaysWithHolder: true`
(`07b:482`, `07c`, `07d:440`, `07e:456`, `07f:354,905`), which rations both sides and leaves
`out.dealerInventory = 0` by construction, and `reg.bankingSector.corpBondDealerInventory` is now
`regionalDeskView` — a *derived read* of what owned desks hold (`07b:568-572`), not a residual.

So D4.a follows: a desk at zero capacity simply stops posting, the level has to move to find real
holders, and if it cannot, the auction fails. F1 is the same fact. This is the shape every other
tree's dealer node should be checked against.

### ❌ C4 / B2 — THE DESK CANNOT TELL ONE CLIENT FROM ANOTHER

Two nodes, one absence. `buildDealerDeskParticipants` posts **one schedule per book per bank**, and
the clearing engine matches it against an anonymous aggregate. Nothing anywhere identifies who is
on the other side of a desk's fill, so:

- **C4** — adverse selection has no channel. A desk cannot widen for an informed counterparty
  because it never learns which counterparty it faced;
- **B2** — the desk's information advantage from *seeing the flow* is not represented. It observes
  its own fills (`priorPositions` next week) and nothing else; it never sees a client's direction,
  and no decision anywhere in the model reads a desk's order flow.

**§3 step 37-VIEW**, and it is a real one rather than a cosmetic one: B2 is one of the three
reasons the tree gives for why a desk quotes at all, and C4 is a term the replacement quote in C5
needs. Note the prerequisite — the clearing engine would have to return *who traded with whom*, not
just each participant's net fill.

### ⚠️ D3 — INVENTORY CONSUMES CASH AND CAPITAL, AND IS NEVER CHARGED RENT

The desk's two real constraints are both present and both good: `bankTotalAssetsLocal:99` adds
`dealerDeskGrossLocal(sheet.dealerDeskInventory)` to the leverage denominator one-for-one (D2 `✅`,
F2 `✅`), and `buildDealerDeskParticipants:121` limits net purchases to reserves above the bank's
deposit buffer, so a well-capitalised desk can still be unable to bid.

What is missing is D3's **weekly cost**. Nothing charges a desk for carrying a position from one
week to the next: the reserves it spent stop earning the central bank's rate, which is a real
opportunity cost, but no funding leg is booked and no repo finances the inventory. So a desk that
sits on a position for a year pays nothing for the year, and the *carry* half of a market maker's
economics — the thing that makes it want to turn its book over — is absent. Its only pressure to
sell is the inventory skew in C2.

**§3 step 37-COSTOFCAPITAL**, small: the desk's book should be financed like any other asset the bank
holds. It pairs with the repo demand step 17e is looking for.

### ⚠️ E1 / E3 / ❌ E2 — ONE DESK HEDGES, IN ONE MARKET

E1.a is `✅` and is the tree's other good result: when the FX forward desk wants to lay off its
book it **trades**. `runFxForwardMarket` writes `FxDealerBook.netNotionalByRegion`, and
`fx-clearing.ts:318-330` puts that whole net position into the spot auction as a real schedule
priced off the cleared basis — a counterparty takes it or the desk keeps it. That is a hedge as a
trade, not a reduction in a number.

Everything else is missing. **No cash desk hedges anything**: a corporate-bond desk long 20bn of
one issuer has no offsetting swap, no index short, and no way to reduce the risk other than
selling the bonds. So **E2** (`❌`) — the hedge is imperfect and the residual is basis risk the
desk carries — has nothing to be a residual *of*.

**E3** is `⚠️` for the same reason: an interdealer market exists in exactly one place,
`fx-squaring.ts:squareInterbankFxPositions`, where two regions' desks swap each other's currency
shorts at the rate in force. That is a genuine interdealer market and it does what E3 says
(inventory gets redistributed between desks). There is **no interdealer market in any cash book**:
two bank desks in the same region, one long and one short the same bond, never trade with each
other — they only meet through the auction, and only via the anonymous aggregate.

**§3 step 37-VIEW**, . The cash-book interdealer market is the smaller half; desk hedging (E1/E2)
is the larger, and it is the natural consumer of the IRS and CDS books that
`interest-rate-swaps.md` B5 and `cds.md` B4 record as having no dealer.

### ⚠️ E4 / B3 — TWO READS THAT NEARLY EXIST

**E4.** Σ desk inventory is already inside the ownership identity: `audit/ownership.ts:47,51`
folds the desks' CP and corporate-bond positions into `held` for O1's issued-versus-held check, so
the number is real and it reconciles. What the node additionally asks — *"it should move with
client flow"* — is not read anywhere, and cannot be until B2's flow is visible. **A measurement,
for §3 step 38.**

**B3.** The client does pay for immediacy — the fee in `settleClearedBook` — but it pays the same
whether it got immediacy or not: the fee is charged on gross traded value in every book that
passes a non-zero `dealerSpreadBps`, including trades that matched client against client with no
desk between them. So *"the alternative is waiting for a natural counterparty"* is charged for even
when the natural counterparty was found. Closes with C5.

### ⚠️ A2 / C1 — ONE SCHEDULE, NOT TWO QUOTES

A2 says a desk quotes a price at which it will buy **and** a price at which it will sell.
`buildDealerDeskParticipants` posts one `ParticipantDemand` — a single `reservationStat` with a
`fullSizeStatRange` — so the desk has one downward-sloping schedule with a neutral point at its
current inventory. That is *behaviourally* two-sided (it buys below the neutral level and sells
above it, which is C2 working correctly) but it is not two quotes, and it is why the bid–offer has
to be bolted on separately in C5.

C1's four inputs: **inventory** `✅` (`neutralFraction = priorLocal / maxHoldingLocal`), **risk limit**
`✅` (`dealerDeskCapacityLocal`), **cost of funds** `❌` (D3), **view** `❌` (nothing anywhere gives a
desk an opinion about a level — `dealer-desk.ts`'s own header says so: *"inventory-driven price
discovery, not a view"*, which is a deliberate simplification worth naming rather than a defect).
Recorded as `⚠️`: two of four, with the missing two being D3's funding cost and a view the model
has deliberately not given anyone.
