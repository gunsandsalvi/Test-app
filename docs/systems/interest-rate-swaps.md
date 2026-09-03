# SYSTEM: INTEREST-RATE SWAPS

Exchanging a fixed rate for a floating one on a notional. The largest derivative market there is,
because every borrower and every asset manager has a duration position it did not choose and can
change here without touching the underlying debt.

Satisfies `../instruments/derivative.md`; runs on `the-derivative-layer.md`.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. THE CONTRACT
- **A1** REASON — satisfies `../instruments/derivative.md`, answering these its own way:
  - A1.a **D3 underlying** — a **named floating reference rate** that is observable and
    transacted (`indices.md` D3, `money-market.md`)
  - A1.b **D4 payoff** — periodic exchange of fixed against floating on the notional; only the
    **net** moves
  - A1.c **D7 price** — the **fixed rate that makes the swap worth zero at inception**, cleared
  - A1.d **D2 notional** — never exchanged, which is why a swap is not a loan
- **A2** REASON — **two legs with their own periodicity and accrual convention** (rule 8), and
  they need not match — that mismatch is real and it is part of the price
- **A3** REASON — the floating leg **fixes** on a stated date against the observed reference, and
  the fixing is a real observation, not a forecast
- **A4** REASON — both legs are in **one currency**; two currencies makes it a cross-currency swap
  (`fx-forwards-and-xcs.md`)

### B. WHY EACH SIDE IS THERE
- **B1** REASON — a **borrower who issued fixed and wants floating**, or the reverse — it has debt
  it cannot economically reissue (`corporate-credit.md`, `banks-funding-and-liquidity.md`)
- **B2** REASON — an **asset manager with a duration mismatch**: a pension whose liabilities are
  long and whose assets are not (`insurers-and-pensions.md` D)
  - B2.a this is a **structural, one-way demand**, and it is why long swap rates behave the way
    they do
- **B3** REASON — a **bank managing its own gap**: assets repricing at a different speed from
  liabilities (`banks-funding-and-liquidity.md` D)
- **B4** REASON — a **speculator** with a view on rates
- **B5** REASON — a **dealer** running a book (`dealer-desks.md`), hedging its net position

### C. THE CURVE
- **C1** REASON — swaps exist at **many tenors**, and the set of cleared fixed rates **is** a
  curve
  - C1.a the curve is a **read of cleared prices**, never a fitted object that then prices the
    swaps (rule 3, and `indices.md` A3's circularity)
- **C2** REASON — a **forward rate is derived** from the curve, and it is what the market thinks,
  not what will happen
- **C3** REASON — the **swap curve and the sovereign curve are different curves**
  (`sovereign-credit.md`), and the difference is the swap spread
  - C3.a which is a **consequence** — of bank credit, collateral, balance-sheet cost and who is
    forced to be on which side — and it is measured, never set
- **C4** VERIFY — a change in the policy rate should move the short end through the reference rate
  and the long end through expectations, and the two channels are different

### D. VALUATION AND CASH
- **D1** REASON — after inception the swap has a **mark**, positive to one side
  (`../instruments/derivative.md` D8)
- **D2** REASON — the mark **moves with the curve**, and the move is a real gain and a real loss
- **D3** REASON — **variation margin turns that mark into cash**
  (`the-derivative-layer.md` D2), so a rate move is a liquidity event long before it is a P&L event
  - D3.a a hedger whose hedge is winning is receiving cash while its hedged item shows an unrealised
    loss, and the mismatch is a real funding problem
- **D4** VERIFY — Σ marks across the two sides = 0, and Σ net payments = 0, every period

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no notional exchange.** If the notional moves, it is a loan and it belongs on
  the balance sheet as one
- **E2** FORBID — **no fixed rate solved from the discount curve alone.** The fixed rate is
  cleared; the curve is read from the cleared rates. Doing it the other way makes the market a
  restatement of a formula (`../instruments/derivative.md` D7.b)
- **E3** FORBID — **no floating leg on a rate this world does not produce**
  (`indices.md` D3.b)

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 satisfies `../instruments/derivative.md` | `src/domain/derivatives/classes/irs.ts:IRS_PROFILE` | ⚠️ |
| A1.a D3 underlying — a named floating reference rate, observed and transacted | `src/engine/simulation/stages/02b-bank-diversification.ts:repoRateAnnual` | ✅ |
| A1.b D4 payoff — periodic fixed against floating; only the net moves | `src/domain/derivatives/classes/irs.ts:periodicLegUSDToB` | ✅ |
| A1.c D7 price — the fixed rate that makes the swap zero at inception, cleared | `src/engine/simulation/stages/derivative-markets/irs.ts:runSwapMarket` | ✅ |
| A1.d D2 notional — never exchanged | `src/domain/derivatives/contract.ts:notionalUSD` | ✅ |
| **A2 two legs with their own periodicity and accrual convention, need not match** | — | ❌ |
| A3 the floating leg FIXES on a stated date against the observed reference | `src/domain/derivatives/profile.ts:overnightRateAnnual` | ⚠️ |
| A4 both legs in one currency | `src/engine/simulation/stages/derivative-lifecycle.ts:payToB` | ✅ |
| B1 a borrower who issued fixed and wants floating, or the reverse | `src/engine/simulation/stages/derivative-markets/irs.ts:runSwapMarket` | ⚠️ |
| B2 an asset manager with a duration mismatch | `src/domain/institution-profiles.ts:liabilityDriven` | ✅ |
| B2.a a structural, one-way demand | `src/engine/simulation/stages/institutional-balance-sheet.ts:institutionTotalAssetsUSD` | ✅ |
| B3 a bank managing its own repricing gap | `src/domain/derivatives/classes/irs.ts:repricingLossUSD` | ✅ |
| B4 a speculator with a view on rates | — | ❌ |
| B5 a dealer running a book, hedging its net position | — | ❌ |
| C1 swaps at many tenors; the set of cleared fixed rates IS a curve | `src/domain/derivatives/classes/irs.ts:SWAP_TENORS` | ✅ |
| **C1.a the curve is a READ of cleared prices, never a fitted object that prices the swaps** | `src/engine/nelsonSiegel.ts:fitNelsonSiegelParams` | ⚠️ |
| C2 a forward rate is derived from the curve | `src/engine/nelsonSiegel.ts:calculateForwardRate` | ❌ |
| C3 the swap curve and the sovereign curve are different curves | `src/domain/derivatives/classes/irs.ts:SWAP_TENOR_ZERO_FIELD` | ✅ |
| C3.a the swap spread is a consequence, measured and never set | `src/engine/simulation/stages/derivative-markets/irs.ts:runSwapMarket` | ✅ |
| C4 VERIFY policy moves the short end through the reference, the long end through expectations | — | ❌ |
| **D1 after inception the swap has a mark** | `src/domain/derivatives/classes/irs.ts:markToMarketUSDToA` | ❌ |
| D2 the mark moves with the curve; a real gain and a real loss | — | ❌ |
| **D3 variation margin turns the mark into cash** | — | ❌ |
| D3.a a winning hedge is receiving cash while the hedged item shows a loss | — | ❌ |
| D4 VERIFY Σ marks = 0 and Σ net payments = 0, every period | — | ❌ |
| E1 FORBID no notional exchange | `src/engine/simulation/stages/derivative-lifecycle.ts:settleDerivativeClass` | ✅ |
| **E2 FORBID no fixed rate solved from the discount curve alone** | `src/engine/pricing.ts:calculateParSwapRate` | ⚠️ |
| E3 FORBID no floating leg on a rate this world does not produce | `src/domain/derivatives/profile.ts:DerivativeMarketView` | ⚠️ |

---

## 3. THE DIFF

### ❌ D1–D4 — THE SWAP HAS NO MARK, SO SECTION D DOES NOT EXIST

`classes/irs.ts:IRS_PROFILE` sets `markToMarketUSDToA: () => null`. A swap in this model is worth
**zero to both sides between its weekly nets**, for its entire two-to-ten-year life. Everything in
section D follows from that one line:

- **D1/D2** — there is no mark, so there is no gain and no loss to move with the curve. A payer of
  fixed struck at 3% when the curve is now 6% carries no asset;
- **D3** — `initialMarginRate: 0` and no mark means **no margin flows at all** on the largest
  class in the book. The node's point — *"a rate move is a liquidity event long before it is a P&L
  event"* — has no channel;
- **D3.a** — the hedger's funding mismatch (winning hedge paying cash against an unrealised loss
  on the hedged item) cannot occur, so the one thing swaps do to a balance sheet in a stress week
  does not happen;
- **D4** — nothing to sum.

The value does exist in one place and only one: `closeOutUSDToB`, computed when a **counterparty
dies** (`derivative-lifecycle.ts:250`) as the remaining weekly nets at today's par, undiscounted.
So the model knows how to value a swap and does it exactly once per contract, at the moment the
contract can no longer be a liquidity channel.

**Already §3 step 17**, which requires *"variation margin is the mark, daily"* for every class and
names the undiscounted close-out (`irs.ts:47`) in the same breath. Recorded here because the
IRS-shaped consequence is bigger than the step's wording suggests: this is not one class missing a
number, it is the whole of `interest-rate-swaps.md` section D having no code.

### ⚠️ C1.a — TWO CURVES, AND THE SWAP RESERVATION READS THE FITTED ONE

**KNOWN(25) — this is the node.** Step 25's *"one curve owner"* is C1.a's code side, and the swap
book is where the split does damage.

The swap curve itself is honest: `runSwapMarket:238` writes `reg.securedCurve` from two cleared
repo prints and three cleared swap par rates, and its comment says exactly what C1.a asks —
*"Every point is a level something traded at this week, which is what a benchmark curve IS."*
That half is `✅`.

The divergence is on the **input** side. Every receiver's reservation is
`reg.zeroRates[SWAP_TENOR_ZERO_FIELD[k]]` (`:143`, `:166`) — the government bond of the same
tenor, which is the right economics — but `zeroRates` is the object step 25 names as having two
owners: `07c-sovereign-bond-clearing.ts:523` writes `reg.yieldCurveParams = fittedParams` and
`07f-short-debt-clearing.ts:460` refits the same params through bills + bonds while leaving
`zeroRates.tenor2Y…30Y` at 07c's values. `P6` measures all 20 points disagreeing, worst 36bp. So
the swap's cleared price is a print, and the schedule it clears against is a fit that two stages
disagree about.

Nothing to re-derive here — step 25 owns it. The node is `⚠️` and not `❌` because the swap curve
is a read; it is the sovereign curve underneath it that is fitted.

### ⚠️ E2 — THE PAR RATE IS SOLVED FROM THE DISCOUNT CURVE, FOR THE PLAYER

The FORBID is honoured in the one book: `runSwapMarket` clears a par rate from real pay-fixed
demand against real receive-fixed schedules and writes it to `reg.swapParRateByTenor`.

It is broken in the legacy layer. `pricing.ts:calculateParSwapRate` is
`(1 − P(0,T)) / Σ τᵢ P(0,tᵢ)` off `NelsonSiegelParams` — the textbook solve — and
`priceInterestRateSwap` marks every player IRS position with it
(`12-portfolio-and-positions.ts:250`, passing `updatedRegions[pos.region].yieldCurveParams`). The
player's swap market **is** a restatement of a formula, which is the node's own sentence. Those
positions also have no counterparty (`../instruments/derivative.md` D1.a) and their P&L reaches
`state.portfolio.cashUSD` through `13-news-and-turn-summary.ts:25`.

**Already §3 step 17b / step 26** — 17b for moving stage 12's positions onto the one book, 26 for
deleting the formula prices. Neither names `calculateParSwapRate` explicitly; step 12b names its
siblings (`priceCorporateBond`, `priceLeveragedLoan`) and says step 26 deletes the caller
outright, which takes this with it.

### ❌ B4 / B5 — THE MARKET HAS TWO PARTICIPANTS AND BOTH ARE HEDGERS

`runSwapMarket` builds exactly two populations: pay-fixed demand from banks whose sovereign book's
two-sigma repricing loss exceeds absorbable capital and from corporates whose covenant headroom
cannot take a rate shock, and receive-fixed supply from `liabilityDriven` institutions with a
duration gap. There is **no speculator** (B4) and **no dealer** (B5): `dealerSpreadBps: 0` is
passed to the clearing engine at `:179`, and no bank desk posts a swap schedule.

**Consequence.** Both sides of every swap are there because a constraint binds, so the cleared par
rate is a function of two regulatory gaps rather than of any view about rates. When neither gap
binds in a region the book does not open at all (`if (instruments.length === 0) return`) and the
tenor carries last week's rate as a quote. It also means C3's swap spread — the model's first
cross-market basis — moves only when capital and covenants move, never when somebody thinks rates
are wrong.

**Becomes a §3 step.** It is the swap-book instance of the same absence 17c records for CDS
(*"an asset manager or credit fund taking a VIEW rather than a hedge — the other side of the
market, and the reason a spread is a price rather than a bank's internal transfer"*), and the two
should be built together; 17f's `RELATIVE_VALUE` book is the natural home for B4.

### ❌ A2 — ONE PERIODICITY, NO ACCRUAL CONVENTION

Both legs pay weekly and divide by 52: `irs.ts:40` is
`(c.notionalUSD * (c.strike - m.overnightRateAnnual(c.regionId))) / 52`. There is no fixed-leg
frequency, no floating-leg frequency, no day count, and no accrual. The node's point is that the
mismatch between the two legs is **real and part of the price**; here there is one leg computed as
a difference, so a basis swap, a quarterly-versus-semi-annual mismatch and a stub period are all
unrepresentable, and rule 8's convention question has no answer to give.

**Becomes a §3 step** — small, and shared with `../instruments/derivative.md` D6.a, which records
the same absence for every class.

### ⚠️ A3 — THE FLOATING LEG DOES NOT FIX, IT READS

`profile.ts:overnightRateAnnual` resolves to `reg.repoRateAnnual ?? reg.policyRate` and the leg
consumes it in the same week it is published. There is no fixing date, no fixing lag, and no
record of what the rate fixed at — so a contract cannot be in-arrears versus in-advance, and a
week's fixing cannot be disputed or observed by anyone. The reference itself is real and cleared
(`02b-bank-diversification.ts:414` writes `reg.repoRateAnnual` from the repo session), which is
why this is `⚠️` and E3 is not `❌`: the *rate* exists, the *fixing* does not.

The `?? reg.policyRate` fallback is worth naming separately: in a week where the repo book does
not print, every swap in the region silently references an **administered** rate instead of a
cleared one, which is the thing `runSwapMarket`'s own header says stopped happening (*"it only
became meaningful once the floating leg stopped referencing an administered rate"*).

### ❌ C2 / C4 — A FORWARD RATE NOBODY DERIVES, AND A CHANNEL NOBODY MEASURES

`nelsonSiegel.ts:calculateForwardRate` exists and **has no callers anywhere in `src`.** So C2's
forward — *"what the market thinks, not what will happen"* — is not produced, not published and
not read; and when it is revived it must be derived from `securedCurve` (the swap curve) rather
than from the fitted sovereign params it currently takes, or it inherits step 25's split.

C4 is a VERIFY with no reader: nothing measures whether a policy move reaches the short end
through the reference rate and the long end through expectations, and with C2 absent the second
channel has no representation at all. **A measurement, for §3 step 38**, with the note that it
cannot be measured until C2 exists.

### ⚠️ B1 — EVERY HEDGER IN THIS MARKET IS ON THE SAME SIDE

B1 names a two-way demand: a borrower who issued fixed and wants floating, **or the reverse**.
The code has only the reverse-of-the-reverse: `runSwapMarket:82-121` builds pay-fixed demand from
banks long fixed-rate sovereigns and from corporates with floating debt, and nothing anywhere
generates receive-fixed *hedging* demand. The receive side is filled entirely by liability-driven
institutions closing a duration gap (B2), which is a different reason.

So the float is one-directional by construction, and a week in which the natural hedging flow
should be the other way — rates falling, corporates wanting to swap fixed debt to floating — is
not expressible. Same family as B4/B5 above and closes with them.
