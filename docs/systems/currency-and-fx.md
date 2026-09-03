# SYSTEM: CURRENCY AND FX RATES

Money is denominated. A number without a currency is not an amount, and two amounts in different
currencies are not comparable without a rate. This tree is the **type**: what a currency is, what
a rate is, and what must be true of both. The market that produces the rate is `fx-spot.md`; the
contracts that trade it forward are `fx-forwards-and-xcs.md`.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A CURRENCY IS
- **A1** REASON — a **unit of account** in which claims are denominated and settled
- **A2** REASON — issued by a **named issuer** — a central bank — whose liability it is
  (`the-central-bank.md` B)
- **A3** REASON — it is a **property of every amount**: every balance, price, coupon, payment and
  contract carries one (rule 9)
  - A3.a a function that takes an amount takes its currency with it, or it is a function over a
    domain it cannot type-check
- **A4** FORBID — **no implicit currency.** An amount whose currency is inferred from where it was
  found is inferred wrong exactly when it matters — a foreign holding, a cross-border payment
- **A5** REASON — currencies are a **closed, named set**; a party can hold any of them

### B. WHO IS IN WHICH
- **B1** REASON — a party has a **home currency**, the one its region uses and it reports in
- **B2** REASON — a party can hold **any currency it has acquired**, and holding one is holding a
  claim on that currency's banking system, not a converted number
  - B2.a so a party has an **account per currency it holds** (`money-and-settlement.md` C)
- **B3** FORBID — **no conversion at the ledger boundary.** A payment in EUR lands as EUR; the
  decision to convert is a separate, explicit trade with a counterparty and a rate. Converting on
  arrival makes the FX market invisible and unmeasurable — the position never exists, so it can
  never be seen to be wrong
- **B4** REASON — a party **short a currency it owes** must acquire it, from somebody, at a price
  (`fx-spot.md` C)
- **B5** REASON — a **bank's foreign balance is its business**, not a client conversion: it is the
  other side of its clients' trades, and it is a position it chooses to run or square

### C. WHAT A RATE IS
- **C1** REASON — the **price of one currency in another**, and it is a price like any other:
  cleared, not assigned (rule 1)
- **C2** REASON — it is **directional and consistent**: rate(A→B) = 1 / rate(B→A) exactly
- **C3** REASON — it is **transitive**: A→B→C and A→C agree, or there is an arbitrage and somebody
  must be taking it
  - C3.a which means the rates are **one object**, not a table of independent pairs (rule 3)
- **C4** REASON — a **numéraire** exists for reporting and aggregation only
  - C4.a FORBID — the numéraire is **not where value lives.** Storing every balance in the
    numéraire and converting on read destroys the currency position, which is the thing that
    gains and loses money
- **C5** VERIFY — the rate used to value and the rate used to settle are **the same rate**

### D. TIME AND REVALUATION
- **D1** REASON — a rate is **in force for a stated period**, and every use in that period uses it
  - D1.a a rate that changes mid-period lets a book be valued at one and paid at another, and the
    difference lands as an unexplained residual on somebody
- **D2** REASON — when the rate moves, every foreign position **revalues**, and the revaluation is
  a real gain or loss to a named party
  - D2.a it hits equity for a firm or bank, and the central bank's own account for the issuer
  - D2.b FORBID — **an unrevalued foreign position is money created or destroyed silently.** It
    is the same defect as a stale mark, in the currency dimension
- **D3** REASON — revaluation happens **before anything uses the new rate**, so nothing values at
  the new rate against a book still carried at the old
- **D4** VERIFY — Σ(revaluation gains) + Σ(revaluation losses) = the rate move applied to the net
  open position, and the net open position across all parties in a currency is what the issuer
  and the rest of the world hold

### E. WHAT MOVES A RATE
- **E1** REASON — the rate moves because **somebody trades at it** (`fx-spot.md`)
- **E2** REASON — the reasons participants have are real: **trade flows**, **rate differentials**,
  **portfolio shifts**, **hedging demand**
  - E2.a a rate differential is a reason to hold one currency over another, and the cost of
    hedging it away is why the reason does not automatically become a free lunch
- **E3** FORBID — **no exogenous rate path.** A rate that follows a written series is not a price,
  and everything derived from it inherits that
- **E4** VERIFY — persistent one-way flow should move the rate, and if it does not, the mechanism
  is not reading the flow

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a unit of account | `src/domain/geography.ts:CurrencyCode` | ✅ |
| A2 issued by a named issuer | `src/domain/central-bank.ts:CentralBank` | ✅ |
| A3 a property of every amount | `src/domain/assets/index.ts:countedIn` | ⚠️ |
| A3.a a function takes the currency with the amount | `src/engine/simulation/stages/settlement.ts:PaymentInstruction` | ✅ |
| **A4 FORBID no implicit currency** | `src/engine/ledger/accounts.ts:homeCurrencyOf` | ⚠️ |
| A5 a closed, named set | `src/domain/geography.ts:CURRENCY_CODES` | ✅ |
| B1 a home currency | `src/domain/geography.ts:currencyOf` | ✅ |
| B2 it can hold any currency it acquired | `src/engine/ledger/accounts.ts:heldCurrenciesOf` | ✅ |
| B2.a an account per currency held | `src/engine/ledger/accounts.ts:accountKey` | ✅ |
| **B3 FORBID no conversion at the ledger boundary** | `src/engine/ledger/accounts.ts:applySettledRow` | ✅ |
| B4 short a currency ⇒ it must acquire it | `src/engine/simulation/stages/fx-funding.ts:fundForeignCurrencyShortfalls` | ✅ |
| B5 a bank's foreign balance is its business | `src/engine/simulation/stages/fx-squaring.ts:squareInterbankFxPositions` | ✅ |
| C1 the price of one currency in another | `src/domain/currency.ts:rateOf` | ✅ |
| C2 directional and consistent | `src/domain/currency.ts:convert` | ✅ |
| **C3 transitive — the rates are ONE object** | `src/domain/currency.ts:FxTable` | ⚠️ |
| C3.a not a table of independent pairs | `src/engine/simulation/stages/06-fx-and-trade.ts:publishFxRates` | ⚠️ |
| C4 a numéraire for reporting only | `src/domain/currency.ts:toNumeraire` | ✅ |
| C4.a FORBID the numéraire is not where value lives | `src/engine2/world.ts:PersistentAccounts` | ✅ |
| C5 value and settle at the same rate | `src/engine2/world.ts:openFxWeek` | ✅ |
| D1 one rate in force for the period | `src/engine2/world.ts:openFxWeek` | ✅ |
| D1.a a rate that changes mid-period is a residual | `src/engine/simulation/stages/context.ts:WeeklyStepContext` | ✅ |
| D2 every foreign position revalues | `src/engine/simulation/stages/fx-revaluation.ts:runFxRevaluationStage` | ✅ |
| D2.a it hits equity, and the issuer's own account | `src/domain/central-bank.ts:centralBankLiabilitiesUSD` | ✅ |
| D2.b FORBID an unrevalued position is silent money | `src/engine/audit/money.ts:auditMoney` | ✅ |
| D3 revaluation happens before anything uses the new rate | `src/engine/simulation/core.ts:advanceWeeklyStep` | ✅ |
| D4 Σ gains + Σ losses = the move on the net open position | — | ❌ |
| E1 it moves because somebody trades at it | `src/engine/simulation/stages/fx-clearing.ts:runFxClearingStage` | ✅ |
| E2 the reasons are real | `src/domain/fx-market.ts:speculatorMaxPositionUSD` | ✅ |
| E2.a a rate differential is a reason, hedging is its cost | `src/domain/derivatives/classes/fx-forward.ts:FX_FORWARD_PROFILE` | ✅ |
| **E3 FORBID no exogenous rate path** | `src/engine/macro/evolution.ts:evolveFxPair` | ⚠️ |
| E4 one-way flow should move the rate | `src/engine/simulation/stages/fx-clearing.ts:recordForeignHoldingsSnapshot` | ✅ |

---

## 3. THE DIFF

### ⚠️ C3 / C3.a — THE MARKET CLEARS SIX PAIRS AND THE LEDGER READS THREE

This is the finding of this tree, and it is invisible from either side alone.

`bootstrap/commodities-and-fx.ts:GENERATED_FX_PAIR_LEGS` defines **six** pairs: EUR/USA, UK/USA,
USA/JPN — and three CROSSES, EUR/UK, EUR/JPN, UK/JPN. `fx-clearing.ts`'s header (XB6) explains at
length why: each pair clears on its own flow so that *"the USD was the cheapest vehicle currency
BY CONSTRUCTION"* stops being true, with triangular consistency demoted from an identity to an
outcome that bounded desk arbitrageurs may fail to enforce. That is exactly what E3 and C3 ask for,
and the market delivers it.

**Then `06-fx-and-trade.ts:publishFxRates` reads only the three legs against USA:**
`REGION_IDS.forEach(r => v2.fxNext[CURRENCY_BY_REGION[r]] = getFxToUsd(fxPairs, r))`. The three
cleared CROSS rates reach `v2.fx` nowhere. Every actual conversion — `currency.ts:convert` in
`fx-funding`, in settlement, in every valuation — computes `rateOf(from) / rateOf(to)`, a pure
triangulation through the numéraire.

So there are **two representations of the EUR/GBP rate** (rule 3): the one the market cleared, and
the ratio the ledger uses. They agree only to the extent the desks arbitraged them, which the
header is explicit they may fail to do — and where they disagree, the difference is money paid at
one rate and valued at another. Worse, the defeat is silent and total: **the USD is still the
vehicle currency by construction for every payment in the model**, which is the precise defect
XB6 was built to remove. The market half of the fix landed and the ledger half never did.

C3 stays `⚠️` and not `❌` because the invariant C3 asks for does hold in the ledger — trivially,
by triangulating. What is missing is that it holds for the wrong reason, and it discards a cleared
price to do it (rule 1's mirror image: a price that cleared and is used by nothing).

Not a §3 step today. **Becomes one**, and it is small: `publishFxRates` must carry the cross prints
into a rate object the ledger can express a cross in, and `convert` must read them.

### ⚠️ E3 — THE RATE IS CLEARED, THE BASIS IS STILL A FORMULA

`evolution.ts:evolveFxPair` no longer moves the rate — `fx-clearing` does — but it still moves
`basisSpreadBps` by `(rDomestic − rForeign) * 20 + noise` every week. The cross-currency basis is a
real price paid by whoever needs a currency more (`fx-forwards-and-xcs.md` B3), and here it is an
interest differential times a constant plus a random walk: rule 4's defect, one field over from
where it was found last time. It belongs to `fx-forwards-and-xcs.md`'s diff and is recorded there
as the same finding.

### ⚠️ A3 / A4 — THE SUFFIX STILL SAYS USD

`assets/index.ts:countedIn` is the right abstraction and is present, but 11,243 identifiers still
carry a `…USD` suffix while holding local money, and an account's currency is a column while a
FIGURE's currency is still a naming convention. That is §3 step 13c, already a step and already
sized; this tree is a second witness and adds nothing new to it.

### ❌ D4 — THE REVALUATION IS NEVER SUMMED

`fx-revaluation.ts` books the difference for banks and central banks; nothing checks that the total
of every revaluation gain and loss equals the rate move applied to the world's net open position in
that currency. That check is the only thing that can catch a position revalued twice or not at all,
and the M family went green at 16 weeks *because* revaluation was added — so the check would be
measuring exactly the fix that made it green. It belongs in `the-audit.md`'s M family. **Becomes a
step** and is small.
