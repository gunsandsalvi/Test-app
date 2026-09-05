# SYSTEM: PRIME BROKERAGE

The service a bank sells to a leveraged fund: financing, custody, stock borrow, clearing, and one
margin number across all of it. It is the pipe through which hedge fund leverage exists
(`hedge-funds.md`), and the pipe through which a fund's failure reaches a bank.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. THE RELATIONSHIP
- **A1** REASON — a **named bank and a named client**, with a contract that can be ended
- **A2** REASON — the broker **holds the client's assets** and knows the whole position — that
  knowledge is what lets it lend against them
- **A3** REASON — the client can have **more than one** broker, and then no broker sees the whole
  position, which is a real and material blind spot
- **A4** REASON — the broker earns from **financing spread, stock-borrow fees and commissions**,
  and that income is a reason for it to take the risk

### B. FINANCING
- **B1** REASON — the client buys more than its cash allows; the **broker lends the difference**
  against the assets as collateral
  - B1.a so the client's leverage is a **loan from a named lender**, not a property of the client
    (`fund-shares.md` F2)
- **B2** REASON — the loan has a **rate**, above the broker's own cost of funds
  (`banks-funding-and-liquidity.md`), and the client pays it in cash
- **B3** REASON — the broker's balance sheet **grows** by the loan, and the loan consumes its
  capital and its liquidity (`banks-capital-and-resolution.md`)
- **B4** REASON — the **short side is financed too**: proceeds of a short are held, and stock is
  borrowed (`securities-lending.md`)
- **B5** VERIFY — the client's leverage is a read of borrowed against equity, and it must equal
  what the broker has lent

### C. MARGIN — THE CORE
- **C1** REASON — the broker sets a **margin requirement** on the whole portfolio, from its own
  view of the risk
  - C1.a it accounts for **offsetting positions**, so a hedged book requires less than the sum of
    its legs
  - C1.b it is a **decision by the broker**, not a formula the client can rely on
- **C2** REASON — the requirement is **remeasured as prices move**, and a shortfall is a **margin
  call**: real money, from the client's account, now
- **C3** REASON — the client must **meet it or be liquidated**
  - C3.a and to meet it, it may have to **sell**, into a market that must clear
    (`the-clearing-engine.md`) — which is the same forced-seller channel as `fund-shares.md` C2.b,
    arriving from the other direction
- **C4** REASON — the broker can **raise the requirement** when it likes what it sees less: worse
  markets, worse client, worse own position
  - C4.a VERIFY — raising margin into a falling market amplifies the fall. That is a consequence
    to be measured, and it is the mechanism behind most of what looks like contagion
- **C5** FORBID — **no margin that is only a number.** An unmet call must have a consequence, and
  a met call must move cash

### D. DEFAULT
- **D1** REASON — a client can **fail to meet a call**, and then the broker **closes the
  positions**, selling collateral at market prices
- **D2** REASON — the proceeds may be **less than the loan**, and the shortfall is the broker's
  loss, hitting its capital
- **D3** REASON — the liquidation is a **real sale into a real market**, so it moves prices, which
  can margin-call other clients (C4.a)
- **D4** VERIFY — the loss chain from one fund to one bank to other funds must be traceable
  party by party; a loss that stops at the fund is a broker that was never really lending

### E. CONCENTRATION
- **E1** REASON — the broker has an **exposure per client**, and it should know it
- **E2** REASON — the client's positions may be **concentrated**, so the collateral is worth less
  in liquidation than it is marked at
- **E3** REASON — A3's multi-broker case means **each broker underestimates**: the true leverage
  is the sum, and no single lender sees it
- **E4** FORBID — **no unlimited exposure.** A broker with no limit per client is a synthetic
  counterparty (`the-clearing-engine.md` B3.a)

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a named bank and a named client, with a contract | `src/domain/prime-brokerage.ts:PrimeBrokerageLine` · `src/engine2/obligations.ts:writePrimeBrokerageRow` · `src/engine/ledger/contract-ledger.ts:primeBrokerageBookOf` | ✅ |
| A2 the broker holds the client's assets and knows the position | `src/engine/simulation/stages/prime-brokerage.ts:runPrimeBrokerageStage` | ⚠️ |
| **A3 the client can have more than one broker** | — | ❌ |
| A4 financing spread, stock-borrow fees and commissions | `src/domain/prime-brokerage.ts:weeklyFinancingLocal` | ⚠️ |
| B1 the broker lends the difference against the assets | `src/engine/simulation/stages/prime-brokerage.ts:targetDrawnLocal` | ✅ |
| B1.a leverage is a loan from a named lender | `src/domain/prime-brokerage.ts:brokerId` | ✅ |
| B2 the loan has a rate above the broker's cost of funds | `src/engine/simulation/stages/prime-brokerage.ts:rateAnnual` | ✅ |
| B3 the broker's balance sheet grows and its capital is consumed | `src/engine/macro/banking.ts:leverageHeadroomLocal` | ✅ |
| B4 the short side is financed too | `src/engine/simulation/stages/securities-lending.ts:fundableLocal` | ⚠️ |
| B5 VERIFY leverage read = what the broker has lent | `src/domain/prime-brokerage.ts:drawnByFund` | ✅ |
| C1 a margin requirement on the whole portfolio | `src/engine/simulation/stages/prime-brokerage.ts:haircutRate` | ⚠️ |
| **C1.a it accounts for offsetting positions** | — | ❌ |
| C1.b a DECISION by the broker, not a formula | `src/engine/simulation/stages/prime-brokerage.ts:measuredHaircutsFor` | ⚠️ |
| C2 remeasured as prices move; a shortfall is a call, in cash | `src/engine/simulation/stages/prime-brokerage.ts:deltaLocal` | ✅ |
| **C3 the client must meet it or be liquidated** | — | ❌ |
| C3.a and to meet it, it may have to SELL into a market | `src/engine/simulation/stages/institutional-balance-sheet.ts:availablePurchaseCapacityLocal` | ⚠️ |
| C4 the broker can RAISE the requirement | `src/engine/simulation/stages/prime-brokerage.ts:measuredHaircutsFor` | ✅ |
| **C4.a VERIFY raising margin into a falling market amplifies it** | `src/engine/simulation/stages/overdraft-sweep.ts:withinLineLocal` | ❌ |
| **C5 FORBID no margin that is only a number** | `src/domain/portfolio.ts:isMarginCall` | ❌ |
| **D1 a client fails a call and the broker closes the positions** | — | ❌ |
| **D2 proceeds below the loan: the shortfall is the broker's loss** | — | ❌ |
| **D3 the liquidation is a real sale that moves prices** | — | ❌ |
| D4 VERIFY the loss chain fund → bank → other funds is traceable | — | ❌ |
| E1 an exposure per client, and the broker knows it | `src/domain/prime-brokerage.ts:lentByBroker` | ✅ |
| E2 concentrated positions are worth less in liquidation | `src/engine/simulation/stages/prime-brokerage.ts:concentration` | ✅ |
| **E3 multi-broker: each lender underestimates the true leverage** | — | ❌ |
| E4 FORBID no unlimited exposure | `src/engine/simulation/stages/overdraft-sweep.ts:runOverdraftSweep` | ⚠️ |

Counts: 10 `✅` · 7 `⚠️` · 10 `❌`.

---

## 3. THE DIFF

### ❌ C3 / C5 / D1–D3 — AN UNMET MARGIN CALL IS REFINANCED, NOT LIQUIDATED

The question this tree exists to ask, and the answer is that **nothing in this model is ever
liquidated by anybody.** `grep -rn "liquidat" src/engine/simulation/stages` returns five hits and
every one is a comment.

The sequence at HEAD, in pipeline order:

1. **The call is real.** `prime-brokerage.ts:137` re-strikes `lineLocal = min(maxDrawnLocal(equity,
   haircut), brokerRoom)`. When the haircut widens or the book falls, `lineLocal` drops below
   `drawnLocal`, `targetDrawnLocal` clamps to it, and `:167-175` pays the difference from the fund to the
   broker. Real money, right direction, right week.
2. **The fund's selling pressure is then clamped away.** `:181` writes
   `primeBrokerageAvailableLocal: Math.max(0, lineLocal - targetDrawnLocal)`. Two files downstream,
   `institutional-balance-sheet.ts:72` reads it with the comment *"Negative when the line has been
   CUT below the draw — which makes the fund a net seller in this week's auctions, at whatever
   they clear, which is what a margin call is."* **It can never be negative.** The writer floors
   it at zero, so the mechanism the comment describes — the one C3.a is about — has never once
   run. The fund's capacity simply goes to zero and it stops buying.
3. **And the shortfall is lent straight back.** `overdraft-sweep.ts:73` runs at the close over
   every fund of every kind: a negative balance draws `drawLocal = -balanceLocal` from the SAME broker
   — `withinLineLocal` is computed only to decide whether to add `OVERDRAFT_PENALTY_BPS` — and the
   loan goes on the broker's `primeBrokerageLoansLocal`. So the money the margin call took out at
   `:171` comes back in at the close, 200bp dearer, and the broker's exposure ends the week where
   it started.

**What that makes impossible.** C5 is broken outright: an unmet call has a consequence, and the
consequence is a higher rate. D1, D2 and D3 have no code at all — no close-out, no shortfall, no
loss on the broker's capital, so `banks-capital-and-resolution.md`'s bank never loses a dollar to
a fund. And C4.a, the node this tree calls *"the mechanism behind most of what looks like
contagion"*, is severed at step 3: the haircut CAN rise into a falling market (C4 is genuinely
✅ — `measuredHaircutsFor` is `2 × median realised weekly move`, so it widens exactly when prices
move), the line CAN fall, and then nothing propagates, because the fund is refinanced rather than
sold out.

For the player the same node fails in its purest form: `portfolio.ts:isMarginCall` is a boolean,
set at `13-news-and-turn-summary.ts:35` as `navLocal < ctx.maintenanceMarginLocal`, and its entire
effect is `marginAlert: 'ACCOUNT IN MARGIN CALL: …'`, a string. A margin that is only a number.

**§3 step 37-MARGIN**, . The shape: a fund whose
draw exceeds its re-struck line is a FORCED SELLER in this week's books — the negative
`primeBrokerageAvailableLocal` the comment already assumes — and one whose sales cannot cover the
draw is closed out by its broker, with the shortfall written off that bank's capital. The
overdraft sweep must stop catching funds in that state, or it undoes the step. Everything needed
exists: the books clear the same week, `unsoldStaysWithHolder` already handles a seller nobody
buys from, and `estate-resolution.ts` already knows how to walk a waterfall.

### ❌ C1.a / A3 / E3 — MARGIN IS GROSS, AND EVERY FUND HAS EXACTLY ONE BROKER

`prime-brokerage.ts:123-132` sums `Math.max(0, h.quantityOrNotionalLocal)` over the fund's rows,
weights each by its class haircut, and widens by `concentration = largest / book`. Two absences
in that arithmetic:

- **No offsetting (C1.a).** A long and a short in the same name consume margin twice — in fact
  the short consumes none at all, because a `LONG_SHORT_EQUITY` fund's short is a `SecurityLoan`
  and a cash collateral balance, neither of which is a row in `itemizedHoldings`. So the one
  strategy in the model that is defined by hedging gets no credit for it and its true exposure is
  invisible to the broker at the same time.
- **No second broker (A3, E3).** The broker is `fund.homeBankId` (an entity id since §3.13-BOOK
  c-then-3b; it was a ticker), a single field. The node's
  point — that with two brokers neither sees the whole position, so both underestimate — cannot
  arise. This is a real absence rather than a defect, and it is the harder half of E3: it needs
  a fund-to-broker relation, not a field.

C1.a is **§3 step 37-MARGIN** (small, and it is a prerequisite for the tree's C4.a to bite the right
funds). A3/E3 are **OUT OF SCOPE for now** and recorded: with one bank per fund the model cannot
have the blind spot, and adding a second broker buys nothing until D1's close-out exists to make
the blind spot cost somebody something.

### ⚠️ C1.b — THE REQUIREMENT IS ONE FORMULA, IDENTICAL FOR EVERY BROKER

`measuredHaircutsFor(ctx, regionId, reg)` takes no broker argument. Every prime broker in a region
haircuts equity at `2 × median(measured weekly price move)` and credit at
`2 × median(bps move) × 5y + sovereign haircut`, so the requirement is a property of the MARKET,
not a decision by a lender. The node's C1.b is explicit that it must be *"a decision by the
broker, not a formula the client can rely on"* — and here it is precisely a formula the client
could compute for itself. The reasoning behind the numbers is good (it is the repricing a lender
must assume before it could sell, read off measured moves rather than posted), which is why this
is ⚠️ and not ❌: what is missing is the broker's own view — its capital position, how much of
this client it already has, what it thinks of this client — entering the number. That is the same
argument `bank-lending.ts:quoteLoanMarginBps` already makes for a loan margin, one asset class
over. **§3 step 37-MARGIN**, small, and it is what makes C4 a decision rather than a volatility
read.

### ⚠️ A2 / A4 / B4 — THE BROKER FINANCES BUT DOES NOT CUSTODY, AND EARNS ONE OF THREE INCOMES

**A2**: the broker READS the fund's register rows to size the haircut but never holds them —
there is no custody relation, the fund's rows stay in the fund's own book, and nothing is pledged.
So the loan at B1 is unsecured in the register even though it is priced as if secured, and D1's
"selling collateral" would have nothing to sell. This is the same gap `securities-lending.md` C5
found from the other side, and the two should be fixed in one commit: a pledged-collateral book at
the broker is what makes both rehypothecation and close-out expressible.

**A4**: of the three incomes the node names, only the financing spread exists
(`weeklyFinancingLocal`, paid at `prime-brokerage.ts:75`). The stock-borrow fee goes to the LENDING
holder, never through a broker; there are no commissions — the fund pays `DEALER_SPREAD_BPS` to
the region's dealer DESKS in each clearing book instead, which is a different party and a
different business. Not a defect so much as a smaller broker than the node describes.

**B4**: the short side is financed by the FUND, not the broker. `securities-lending.ts:291`:
`fundableLocal = institutionSpendableLocal(fund) + max(0, fund.primeBrokerageAvailableLocal)` — the
broker's line does fund the collateral, which is the node's economics, but the proceeds of the
short sale land in the fund's own cash at 07e rather than being held by the broker, and the
borrow is arranged by the fund directly with the lender.

### ⚠️ E4 — THE LIMIT EXISTS IN THE MORNING AND IS WAIVED AT THE CLOSE

`lineLocal = min(maxDrawnLocal(fundEquity, haircut), brokerRoomLocal)` is a real two-sided limit and
`leverageHeadroomLocal` is the broker's own balance-sheet constraint, so E4 holds for the struck
line. It does not hold for the day: `overdraft-sweep.ts:77` lends whatever the fund spent, with
no reference to `brokerRoomLocal` and no reference to the fund's equity — only a penalty rate. A
broker with no capacity left still funds the whole draw. The morning pass then re-prices the
enlarged balance, which is the file's stated defence, but between the two the exposure was
genuinely unlimited. **§3 step 37-MARGIN**, and it is the same step as C3/D1 above — both are the
sweep refusing to let anything fail.

### ❌ D4 — THE LOSS CHAIN IS UNMEASURED BECAUSE THERE IS NO LOSS

*"a loss that stops at the fund is a broker that was never really lending."* Today the loss stops
before the fund: nothing writes `InstitutionalEntity.isDefaulted` anywhere in `src`
(`hedge-funds.md` E3), so there is no first link. **A measurement, for §3 step 38**, but only
once C3/D1 exist — until then there is nothing to trace.

### Also marked, briefly

- **C1 ⚠️** — a requirement on the whole book exists and is one formula for every broker — C1.b.
