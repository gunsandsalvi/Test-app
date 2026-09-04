# SYSTEM: FX SPOT

The market where one currency is bought for another. `currency-and-fx.md` is the type and the
invariants; this is the **mechanism**: who trades, why, and how a rate comes out of it.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT IS TRADED
- **A1** REASON — an **exchange of two amounts in two currencies**, both legs settling
  (`the-register.md` C3: neither leg alone)
- **A2** REASON — the price is the **rate**, quoted one way with its inverse implied
  (`currency-and-fx.md` C2)
- **A3** REASON — the pair set is **all pairs among the currencies that exist**, and the rates
  must be mutually consistent (C3 there) — so a cross is either traded or derived, and if both,
  they must agree or somebody is arbitraging

### B. WHO TRADES AND WHY
- **B1** REASON — **a party that owes a currency it does not have** (`currency-and-fx.md` B4) —
  an importer, a borrower in foreign currency, an investor settling a foreign purchase
- **B2** REASON — **a party with a currency it does not want**: an exporter, a coupon received
  abroad
- **B3** REASON — **an investor changing its portfolio's currency mix**, for yield or for risk
- **B4** REASON — **a hedger** closing a currency exposure it took on for another reason
  (`fx-forwards-and-xcs.md` — the forward is the usual tool, and spot is one leg of it)
- **B5** REASON — **a dealer**, whose reason is spread and inventory (`dealer-desks.md`)
  - B5.a it quotes because it expects the flow to be two-way; it is **not** obliged to take
    whatever arrives (`the-clearing-engine.md` B4)
- **B6** REASON — the **central bank may participate**, for a stated policy reason, as a
  participant with a size and a limit — never as the residual
  (`the-central-bank.md` F)

### C. THE MECHANISM
- **C1** REASON — participants post **schedules in rate space** (`the-clearing-engine.md` A2)
- **C2** REASON — the rate clears where the two sides meet, **per pair and consistently across
  pairs**
  - C2.a the cross-consistency is a constraint on the clearing, not a correction applied after
- **C3** REASON — **the bid–offer is a consequence** of what dealers posted, read off the book
  (`the-clearing-engine.md` E3) — a client crosses it, a dealer earns it
- **C4** REASON — **imbalance moves the rate**: persistent demand for a currency at the old rate
  means the old rate was wrong
- **C5** REASON — one rate is **in force for the period** and both valuation and settlement use it
  (`currency-and-fx.md` D1)
- **C6** VERIFY — with flows netting to zero the rate should not drift; with a one-way flow it
  should move (`currency-and-fx.md` E4)

### D. THE DEALER'S POSITION
- **D1** REASON — a dealer that fills a client is **left with the other side**: a real open
  position in a real currency
- **D2** REASON — it can **square** it — against another client, another dealer, or the market —
  and squaring is a trade with a counterparty, not a disappearance
- **D3** REASON — what it does not square, it **carries**, and the carried position revalues
  (`currency-and-fx.md` D2) — that is the risk it is paid the spread for
- **D4** REASON — it has a **limit** on what it will carry, and when the limit binds it widens or
  stops quoting rather than absorbing more
- **D5** VERIFY — Σ(dealer positions) + Σ(client positions) = 0 in every currency, because every
  trade has two sides

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no conversion without a counterparty.** A party cannot turn EUR into USD by
  itself; somebody took the other side, and that somebody now holds EUR
- **E2** FORBID — **no rate from a formula.** Not PPP, not a rate differential applied to a level,
  not a written path (`currency-and-fx.md` E3)
- **E3** FORBID — **no free arbitrage left standing.** If A→B→C ≠ A→C, either a participant takes
  it and the rates converge, or the inconsistency is a defect — it is never a permanent feature
- **E4** VERIFY — a party's currency position after the market is exactly what it held plus what
  it traded, and no leg landed converted (`currency-and-fx.md` B3)

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 an exchange of two amounts, both legs settling | `src/engine/simulation/stages/fx-funding.ts:fundForeignCurrencyShortfalls` | ✅ |
| A2 the price is the rate | `src/domain/currency.ts:rateOf` | ✅ |
| **A3 all pairs, mutually consistent** | `src/engine/bootstrap/commodities-and-fx.ts:GENERATED_FX_PAIR_LEGS` | ⚠️ |
| B1 a party that owes a money it does not have | `src/engine/simulation/stages/fx-funding.ts:fundForeignCurrencyShortfalls` | ✅ |
| B2 a party with a money it does not want | `src/engine/simulation/stages/fx-squaring.ts:squareInterbankFxPositions` | ✅ |
| B3 an investor changing its currency mix | `src/engine/simulation/stages/fx-clearing.ts:runFxClearingStage` | ✅ |
| B4 a hedger closing an exposure | `src/domain/derivatives/classes/fx-forward.ts:equityHedgeRatioFor` | ✅ |
| B5 a dealer, whose reason is spread and inventory | `src/domain/dealer-desk.ts:DESK_SPREAD_BPS_BY_BOOK` | ✅ |
| B5.a it is not obliged to take whatever arrives | `src/domain/derivatives/registry.ts:deskNotionalCapacityLocal` | ✅ |
| B6 the central bank participates with a limit | `src/domain/fx-market.ts:CENTRAL_BANK_FX_INTERVENTION_SHARE` | ✅ |
| C1 participants post schedules in rate space | `src/engine/simulation/stages/financial-clearing-engine.ts:ParticipantDemand` | ✅ |
| C2 it clears per pair and consistently across pairs | `src/engine/simulation/stages/fx-clearing.ts:runFxClearingStage` | ✅ |
| C2.a cross-consistency constrains the clearing | `src/domain/fx-market.ts:FX_STAT_KIND` | ✅ |
| C3 the bid–offer is a consequence | `src/domain/dealer-desk.ts:DESK_SPREAD_BPS_BY_BOOK` | ⚠️ |
| C4 imbalance moves the rate | `src/engine/simulation/stages/financial-clearing-engine.ts:solveClearingStat` | ✅ |
| C5 one rate in force for the period | `src/engine2/world.ts:openFxWeek` | ✅ |
| C6 flat flow ⇒ no drift; one-way flow ⇒ a move | `src/domain/fx-market.ts:MAX_WEEKLY_FX_MOVE_PCT` | ⚠️ |
| D1 a dealer is left with the other side | `src/domain/dealer-derivatives.ts:FxDealerBook` | ✅ |
| D2 it can square, and squaring is a trade | `src/engine/simulation/stages/fx-squaring.ts:squareInterbankFxPositions` | ✅ |
| D3 what it does not square, it carries and revalues | `src/engine/simulation/stages/fx-revaluation.ts:runFxRevaluationStage` | ✅ |
| D4 it has a limit and stops quoting at it | `src/domain/derivatives/registry.ts:deskNotionalCapacityLocal` | ✅ |
| D5 Σ dealer + Σ client positions = 0 per currency | `src/engine/simulation/stages/fx-clearing.ts:recordForeignHoldingsSnapshot` | ✅ |
| E1 FORBID no conversion without a counterparty | `src/engine/simulation/stages/fx-funding.ts:fundForeignCurrencyShortfalls` | ✅ |
| E2 FORBID no rate from a formula | `src/engine/macro/evolution.ts:evolveFxPair` | ⚠️ |
| **E3 FORBID no free arbitrage left standing** | `src/engine/simulation/stages/06-fx-and-trade.ts:publishFxRates` | ❌ |
| E4 no leg landed converted | `src/engine/ledger/accounts.ts:applySettledRow` | ✅ |

---

## 3. THE DIFF

**This is the best-built market in the model, and it has one hole, at its exit.**

Six participant classes with real balance sheets, three inelastic and three elastic; every pair
clearing on its own flow; the central bank bounded by actual reserves; the dealer bounded by the
same capacity that charges its derivative book. `fx-clearing.ts`'s header states the design and the
code matches it. Nodes B1–B6, C1–C5, D1–D5 are present as written.

### ❌ E3 / ⚠️ A3 — THE ARBITRAGE HAS NOTHING TO CLOSE, BECAUSE THE CROSSES NEVER LEAVE THE MARKET

The same defect as `currency-and-fx.md` C3, seen from the market's side and worse here, because
this tree is where the mechanism was deliberately built.

XB6 demoted triangular consistency from an identity to an outcome and gave it an enforcer: *"the
arbitrageur is a real participant with a real balance sheet — the bank FX desks… whose reservation
on any pair is the rate the other two legs imply. Nothing enforces the identity; desks do, out of
their own capital, and being finite they can fail to."* That is exactly node E3, built on purpose.

But `publishFxRates` promotes only EUR/USA, UK/USA and USA/JPN into `v2.fxNext`. The cleared
EUR/GBP, EUR/JPY and GBP/JPY rates are computed, printed, and then dropped. Everything downstream
converts by `rateOf(from)/rateOf(to)` — triangulation through the dollar — so:

- **the arbitrage the desks are supposed to enforce has no consequence.** Whether they close the
  cross or not, every payment settles at the triangulated rate, so a failure to arbitrage costs
  nobody anything and cannot be measured;
- **the USD is still the vehicle currency by construction** for every real conversion in the model
  — the exact defect the header says the redesign removed. It was removed in the auction and left
  standing one function later;
- **a EUR/JPY hedge is still structurally two USD legs** at the point where it settles, so the
  model still cannot say anything about currency dominance.

E3 is `❌` rather than `⚠️`: the requirement is that no free arbitrage stands, and here the
arbitrage is not merely unclosed, it is unobservable — the divergence between the cleared cross and
the triangulated cross is never computed anywhere.

**§3 step 37-FX-CROSS**, jointly with `currency-and-fx.md` C3. It is small and it is at the seam:
carry the cross prints through `publishFxRates` into the rate object, teach `convert` to prefer a
cleared cross over a triangulated one, and the difference between them becomes a measurable
arbitrage the desks are already positioned to take.

### ⚠️ C3 — THE SPREAD IS A CONSTANT PER BOOK

`DESK_SPREAD_BPS_BY_BOOK.fx` is a per-book constant applied to the cleared rate when a client
converts (`fx-funding.ts`). Node C3, and `dealer-desks.md` C5.a, require the opposite: the
bid–offer is the OUTPUT of the desk's inventory, funding cost, risk and adverse selection, read off
what it posted. A constant cannot skew with inventory, cannot widen under stress, and cannot
refuse. This is `dealer-desks.md`'s finding and is recorded there; noted here as the second
witness.

### ⚠️ C6 — A CAP ON THE WEEKLY MOVE

`fx-market.ts:MAX_WEEKLY_FX_MOVE_PCT` bounds how far a rate may travel in a week. A bound is not a
price (rule 6) and rule 6 says no bounds of any kind; if a week's flow implies a bigger move, the
bound is the mechanism that is missing — most likely the elastic participants' size. It belongs to
§3 step 18's inventory of bounds to delete and is recorded there, with this tree as the reason the
deletion must be paired with sizing the elastic side.

### Also marked, briefly

- **E2 ⚠️** — the rate clears; `evolveFxPair` still walks the cross-currency basis by formula — `fx-forwards-and-xcs.md` B3, 37-SMALL.
