# SYSTEM: FX FORWARDS AND CROSS-CURRENCY SWAPS

Buying a currency for later, and swapping funding from one currency into another. Together they
are how a currency exposure gets hedged and how a bank funds a foreign asset — which makes them
the joint between `fx-spot.md`, `banks-funding-and-liquidity.md` and `cross-border.md`.

Satisfies `../instruments/derivative.md`; runs on `the-derivative-layer.md`.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. THE FORWARD
- **A1** REASON — satisfies `../instruments/derivative.md`, answering these its own way:
  - A1.a **D3 underlying** — the **spot rate** at the future date (`fx-spot.md`)
  - A1.b **D4 payoff** — exchange of two fixed amounts at maturity; both notionals **do** move,
    unlike a rate swap
  - A1.c **D7 price** — the **forward rate**, cleared
  - A1.d **D5 currency** — two of them, one per leg, by definition
- **A2** REASON — it **settles**: real amounts in real currencies on the date, into accounts
  (`money-and-settlement.md`)
- **A3** REASON — before then it carries a **mark and margin** like any derivative, so a forward is
  a funding item long before it is a settlement
- **A4** REASON — a **swap** in the FX sense — spot one way, forward back — is the standard form,
  and it is a **secured loan of one currency against another**, which is what it must be modelled
  as

### B. THE FORWARD RATE
- **B1** REASON — the forward rate is **cleared** from what participants will do
  (`the-clearing-engine.md`)
- **B2** VERIFY — it should sit near spot adjusted for the **two currencies' funding costs**,
  because otherwise somebody can borrow one, buy the other, lend it and lock a profit
  - B2.a covered interest parity is therefore a **consequence of an arbitrage somebody takes**,
    never an identity applied to produce the rate
  - B2.b and the arbitrage is **not free**: it uses balance sheet, capital and credit lines, so a
    persistent basis is possible and is a finding about those constraints
- **B3** REASON — the **cross-currency basis** is the deviation, and it is a real price paid by
  whoever needs the currency more
  - B3.a it widens when funding in one currency is scarce, which is exactly when hedgers need it
- **B4** VERIFY — a region running a funding deficit in a foreign currency should pay the basis,
  as a consequence of B3 and not as a rule

### C. THE CROSS-CURRENCY SWAP
- **C1** REASON — **two floating or fixed legs in two currencies**, notionals exchanged at start
  and end, periodic interest on both
  - C1.a it is `interest-rate-swaps.md` with an FX leg attached, and it inherits both curves
- **C2** REASON — its economic use is **funding**: a party that raised money in one currency and
  needs it in another, for years, without an open FX position
- **C3** REASON — the **notional exchange at the end is at the original rate**, which is what
  removes the currency risk and what creates the counterparty risk
- **C4** REASON — its price includes the **basis** in B3, and that is where a foreign-currency
  funding shortage shows up as a number

### D. WHY EACH SIDE IS THERE
- **D1** REASON — an **importer or exporter** with a known future foreign payment
  (`cross-border.md`)
- **D2** REASON — an **investor holding a foreign asset** who wants the asset and not the currency
  (`insurers-and-pensions.md`, `fund-shares.md`)
  - D2.a and it must **roll** the hedge as the asset persists, which is a recurring demand and a
    recurring cost
- **D3** REASON — a **bank funding a foreign-currency book**: it has deposits in one money and
  loans in another (`banks-funding-and-liquidity.md` E, `currency-and-fx.md` B5)
- **D4** REASON — a **dealer**, whose reason is spread, and whose own currency and funding
  positions constrain what it will quote (`dealer-desks.md`)

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no forward rate from a parity formula.** It is cleared, and parity is checked
  against it (B2.a)
- **E2** FORBID — **no hedge that removes the position without a counterparty holding it.** The
  hedger's currency risk went to a named party (`fx-spot.md` E1)
- **E3** FORBID — **no maturity that passes without both legs settling** in full, in both
  currencies (`the-register.md` C3)
- **E4** VERIFY — a party's hedged foreign asset shows: the asset revaluing one way
  (`currency-and-fx.md` D2) and the forward revaluing the other, and the residual is the basis and
  the imperfection — not zero by construction

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 satisfies `../instruments/derivative.md` | `src/domain/derivatives/classes/fx-forward.ts:FX_FORWARD_PROFILE` | ⚠️ |
| A1.a D3 underlying — the spot rate at the future date | `src/engine/simulation/stages/fx-clearing.ts:runFxClearingStage` | ✅ |
| **A1.b D4 payoff — exchange of two fixed amounts; both notionals move** | `src/domain/derivatives/classes/fx-forward.ts:markToMarketUSDToA` | ❌ |
| **A1.c D7 price — the forward rate, cleared** | `src/engine/simulation/stages/derivative-markets/fx-forward.ts:strikeFor` | ⚠️ |
| A1.d D5 currency — two of them, one per leg | `src/engine/simulation/stages/derivative-lifecycle.ts:payThroughHouse` | ❌ |
| A2 it settles: real amounts in real currencies on the date | `src/engine/simulation/stages/derivative-lifecycle.ts:settleDerivativeClass` | ⚠️ |
| A3 before then it carries a mark and margin | `src/domain/derivatives/classes/fx-forward.ts:closeOutMoveOf` | ✅ |
| **A4 the FX swap is a secured loan of one currency against another** | `src/engine/simulation/stages/fx-squaring.ts:squareInterbankFxPositions` | ❌ |
| B1 the forward rate is cleared from what participants will do | `src/engine/simulation/stages/derivative-markets/fx-forward.ts:clearedBasisBps` | ⚠️ |
| **B2 VERIFY it sits near spot adjusted for the two funding costs** | — | ❌ |
| B2.a CIP is a consequence of an arbitrage somebody takes, never an identity | `src/domain/derivatives/classes/fx-forward.ts:hedgedReservationAdjustmentBps` | ⚠️ |
| B2.b the arbitrage is not free — balance sheet, capital, credit lines | `src/domain/derivatives/registry.ts:deskNotionalCapacityLocal` | ✅ |
| **B3 the cross-currency basis is the deviation, a real price** | `src/engine/macro/evolution.ts:evolveFxPair` | ⚠️ |
| B3.a it widens when funding in one currency is scarce | `src/engine/simulation/stages/derivative-markets/fx-forward.ts:entityHedgeToleranceBps` | ✅ |
| B4 VERIFY a region with a foreign-currency funding deficit pays the basis | — | ❌ |
| **C1 XCS: two legs, two currencies, notionals exchanged at start and end** | — | ❌ |
| C1.a it is an IRS with an FX leg, inheriting both curves | `src/engine/pricing.ts:priceCrossCurrencyBasisSwap` | ❌ |
| C2 its economic use is funding, for years, without an open FX position | `src/engine/simulation/stages/fx-funding.ts:fundForeignCurrencyShortfalls` | ⚠️ |
| C3 the notional exchange at the end is at the original rate | — | ❌ |
| C4 its price includes the basis in B3 | `src/engine/carryCalculator.ts:calculateExpectedCarry` | ⚠️ |
| D1 an importer or exporter with a known future foreign payment | `src/engine/simulation/stages/derivative-markets/fx-forward.ts:corporateExposureByRegion` | ✅ |
| D2 an investor holding a foreign asset who wants the asset, not the currency | `src/engine/simulation/stages/derivative-markets/fx-forward.ts:hedgeableExposureByRegion` | ✅ |
| D2.a it must roll the hedge — a recurring demand and a recurring cost | `src/domain/derivatives/classes/fx-forward.ts:FX_FORWARD_TENOR_WEEKS` | ✅ |
| D3 a bank funding a foreign-currency book | `src/engine/simulation/stages/fx-funding.ts:convertsForItself` | ❌ |
| D4 a dealer, constrained by its own currency and funding positions | `src/domain/dealer-derivatives.ts:FxDealerBook` | ✅ |
| **E1 FORBID no forward rate from a parity formula** | `src/engine/simulation/stages/derivative-markets/fx-forward.ts:runFxForwardMarket` | ⚠️ |
| E2 FORBID no hedge that removes the position without a counterparty holding it | `src/engine/simulation/stages/derivative-markets/fx-forward.ts:pickDealerBank` | ✅ |
| **E3 FORBID no maturity passes without both legs settling in both currencies** | `src/domain/derivatives/classes/fx-forward.ts:markReasonFinal` | ❌ |
| E4 VERIFY the hedged asset and the forward revalue against each other; the residual is the basis | `src/engine/simulation/stages/fx-revaluation.ts:runFxRevaluationStage` | ⚠️ |

---

## 3. THE DIFF

### ⚠️ B3 / C4 — THERE ARE TWO CROSS-CURRENCY BASES AND THEY HAVE NOTHING TO DO WITH EACH OTHER

**This tree owns this finding** (`currency-and-fx.md` points here for it).

`macro/evolution.ts:1298-1306`:

```ts
export function evolveFxPair(fx: FxPair, regions: Record<RegionId, Region>): FxPair {
  const rDomestic = regions[fx.quote].policyRate;
  const rForeign = regions[fx.base].policyRate;
  const basisNoise = (random() - 0.5) * 2.0;
  return { ...fx, basisSpreadBps: Math.round(fx.basisSpreadBps + basisNoise + (rDomestic - rForeign) * 20) };
}
```

Verified: it runs every week at `06-fx-and-trade.ts:63`, for every pair, unconditionally. Three
things are wrong with it and they compound.

1. **It is a formula, not a price.** The move is the policy-rate differential times a stated `20`,
   plus a uniform noise draw — nothing posts a schedule, nothing trades, nobody pays it. Seeded at
   `initialization.ts:785` to `-15`.
2. **It accumulates.** The new value is `fx.basisSpreadBps + …`, so this is a **random walk with
   drift on a level**, not a level. A pair whose policy differential is a steady 1% adds 20bp to
   the basis *every week* — 10.4 percentage points a year — with no bound and no restoring force.
   (Rule 2 is satisfied trivially: there is no bound because there is nothing to bound.)
3. **It is the second basis.** The real one clears in `derivative-markets/fx-forward.ts:255-301`
   against real hedger schedules and real desk capacity, and is published as
   `reg.crossCurrencyBasisBps`. `fx.basisSpreadBps` is a different number on a different object,
   and **no code reconciles them.** They are read by different consumers:
   `crossCurrencyBasisBps` by `fx-clearing.ts:314` (the spot desks' quote width) and by the
   forward book's own opening level; `basisSpreadBps` by `12-portfolio-and-positions.ts:475-489`
   (the player's XCS mark and its carry), `carryCalculator.ts:198`, and `ui/objects/fx.tsx:28,39`,
   which labels it *"basis — cross-currency"* to the player.

**Consequence.** The number the player sees under the name "cross-currency basis", trades against,
and books P&L on is not the price this world clears — and it drifts away from it monotonically.
C4 (*"its price includes the basis, and that is where a foreign-currency funding shortage shows
up"*) is therefore satisfied by the wrong number: the player's XCS carry moves with a policy
differential and a coin flip, never with anybody's funding shortage. It is also a rule-3 shape:
one real thing, two representations, no owner.

**§3 step 37-SMALL**, . Small and clean: delete `evolveFxPair`'s basis line and point every reader
at `reg.crossCurrencyBasisBps`. It is the last thing `evolveFxPair` still does — the rate half
already moved to the cleared FX auction (`domain/fx-market.ts:4` says so) — so the step ends with
the function gone.

### ⚠️ A1.c / B1 / E1 — THE FORWARD RATE IS NOT CLEARED; ONLY THE BASIS IS

`derivative-markets/fx-forward.ts:349` is the whole price:

```ts
strike: ctx.getFxToUsd(issuer) * (1 - basisBps / 10000),
```

Spot, moved by the cleared basis. The **basis** is a genuine cleared price and the file's own
header is right to be proud of it — it replaced `MAX_BASIS × utilization × (0.35 + 0.65 ×
oneWayShare)`, a formula with a crisis-era ceiling. But the node asks for the **forward rate** to
be the cleared price (A1.c, B1), with parity then checked against it (B2.a), and what clears here
is one adjustment to a spot rate that clears somewhere else.

The formula is also **not covered interest parity**, despite the comment saying *"CIP moved
AGAINST the client by the cleared basis"*: there is no `(1 + r_domestic)/(1 + r_foreign)` term
anywhere in it. So a 13-week forward on a pair with a 5-point rate differential is struck within a
basis of spot. The interest differential does exist in the model as
`classes/fx-forward.ts:hedgedReservationAdjustmentBps` — `(issuerPolicyRate − holderPolicyRate) ×
10000` — but that is applied to a **foreign bond buyer's required yield**, not to the forward it
hedges with. So the two halves of CIP live in two places and never meet.

**Consequence.** B2 is unmeasurable (`❌`): you cannot check that the forward sits near
spot-adjusted-for-funding-costs when the funding costs are not in the forward. And carry — the
single largest reason anyone trades an FX forward — is absent from the instrument: rolling a
13-week hedge costs the basis and nothing else, whatever the two policy rates are.

**§3 step 37-FX-CROSS**, . Medium. The pieces exist (both policy rates, a cleared spot, a cleared
basis, a working auction); what is missing is that the auction should print the forward *rate* and
the basis should be read out of it against parity — which is B2.a's direction and rule 3's.

### ❌ C1 / C1.a / C3 — THE CROSS-CURRENCY SWAP DOES NOT EXIST

Section C is a third of this tree and has no code. `DerivativeClassId` is
`'IRS' | 'CDS' | 'COMMODITY_FUTURE' | 'FX_FORWARD'` — there is no XCS class, no two-currency
contract, and no notional exchange at start or end anywhere in `derivativesBook`. The only thing
in `src` bearing the name is `pricing.ts:priceCrossCurrencyBasisSwap`, a formula NPV
(`notional × Δbasis × 0.9 × tenor`) marking the **player's** legacy `XCS` positions
(`12-portfolio-and-positions.ts:466`) off the wrong basis (above), against no counterparty.

**Consequence.** The instrument this tree exists to describe — *"how a bank funds a foreign
asset"*, the joint between `fx-spot.md`, `banks-funding-and-liquidity.md` and `cross-border.md` —
is not in the model. C3's point (the end-notional exchange at the original rate is what removes
the currency risk **and creates the counterparty risk**) has no representation, so a
multi-year foreign funding position cannot exist and cannot fail. What stands in for it is a
13-week forward rolled forever, which is a different instrument with a different risk.

**Already §3 step 17b**, which names *"FX swap lines need an FX funding market first — build the
market, then the lines"*; but 17b is about central-bank swap lines, and the private XCS it depends
on is not itself listed. Recorded here as the prerequisite: an XCS needs the two-currency contract
that `../instruments/derivative.md` D5 says is missing for every class.

### ❌ A1.b / E3 / ⚠️ A2 — THE FORWARD NEVER DELIVERS

`classes/fx-forward.ts` has `periodicLegUSDToB: () => null` and a mark leg only. At maturity
`settleDerivativeClass` pays the final mark delta (`markReasonFinal: 'fx forward variation
margin'`) and drops the contract. **No currency is ever exchanged.** A1.b is explicit that this is
the difference from a rate swap — *"both notionals do move, unlike a rate swap"* — and E3 forbids
exactly what happens: a maturity that passes without both legs settling in full, in both
currencies.

Two consequences beyond the node. A hedger's forward produces a **USD-equivalent** cash flow in
its own home money, so the hedge does not put the foreign currency it was contracted for into
anybody's account: `fx-funding.ts` still has to go and buy it in spot, paying the desk's fx spread
again. And the contract is economically a CFD on the rate rather than a forward, which means
`the-register.md` C3's delivery obligation is not tested here at all.

**§3 step 37-FX-CROSS**, . It cannot be built before `../instruments/derivative.md` D5 (a currency per
leg); the two are one commit.

### ❌ A4 — THERE IS NO FX SWAP, AND THE THING NEAREST TO ONE IS SPOT-FOR-SPOT

A4 says the FX swap — spot one way, forward back — is the standard form and *"must be modelled
as"* a secured loan of one currency against another. `fx-squaring.ts:squareInterbankFxPositions`
is the closest thing in the code and it is not that: two desks short each other's money exchange
**both legs at the rate in force, in the same pass**, deliberately so that *"neither side books a
gain on the swap itself"*. There is no forward leg, no term, no interest and therefore no loan —
it is a spot netting, and an excellent one for what it does (it is what stops the desks running
to −600B of unfunded shorts).

**Consequence.** The single most important funding instrument in cross-border banking is absent,
so a bank's foreign-currency funding is done by buying spot and holding it
(`fx-funding.ts:fundForeignCurrencyShortfalls`) — an outright position, not a swap. That is why D3
below is `❌`.

**§3 step 37-FX-CROSS**, and it is the same step as C1: a two-currency contract with a near leg and
a far leg answers A4 and C1 together.

### ❌ D3 — THE BANKS, WHO NEED THIS MARKET MOST, ARE NOT IN IT

`fx-funding.ts:convertsForItself` excludes `BANK`, `BANK_SECURITIES`, `BANK_CREDIT`,
`CLEARING_HOUSE` and `CENTRAL_BANK` from buying currency as clients, with a correct reason (a
desk's foreign position is inventory, and a bank's nostro is a position). But nothing then gives a
bank a way to *fund* a foreign-currency book: `runFxForwardMarket`'s hedger populations are
institutional entities (`hedgeableExposureByRegion`) and non-bank corporates
(`corporateExposureByRegion`) — `if (c.isBankEntity ...) return` at `:202`. A bank with deposits
in one money and loans in another has no hedge available and no swap to fund with; its mismatch
simply sits as a nostro balance that `fx-revaluation.ts` re-marks.

**§3 step 37-FX-CROSS**, and it is the demand side that would make A4's FX swap worth building —
`banks-funding-and-liquidity.md` E and `currency-and-fx.md` B5 both point at it.

### ❌ B2 / B4 / ⚠️ E4 — THE THREE MEASUREMENTS

**B2** — nothing compares the forward to spot-adjusted-for-funding-costs, and nothing can while
the forward carries no funding costs (above). **B4** — nothing measures whether a region running a
foreign-currency funding deficit actually pays the basis; the ingredients exist
(`reg.crossCurrencyBasisBps` per issuer, and the cross-border flows) and no read joins them.
**E4** — `fx-revaluation.ts:runFxRevaluationStage` re-marks foreign positions and the forward's
mark settles in `settleDerivativeClass`, so both halves move; nothing puts them side by side to
show that the residual is the basis and the hedge's imperfection rather than zero. Since the
forward's mark is `notional × (strike − rate)/strike` on a notional set equal to the hedged
exposure, the residual is in fact near-zero by construction *for the covered part* — which is the
node's own warning.

All three are **a measurement, for §3 step 38**. B2 additionally cannot be run until E1's forward
rate exists.

### ⚠️ B2.a / B2.b — THE ARBITRAGE IS PRICED BUT NOBODY TAKES IT

B2.b is the node this model does best: `registry.ts:deskNotionalCapacityLocal` makes the desk's
willingness to write forwards a function of its remaining leverage headroom through the FX PFE
add-on, shared with every other derivative class it runs — so a persistent basis *is* possible and
*is* a statement about balance sheet, exactly as the node requires. `✅`, and it is the reason the
cleared basis is worth having.

B2.a is `⚠️` for the converse reason: covered interest parity is neither applied as an identity
(good) nor taken as an arbitrage by anybody (bad). No participant borrows one currency, buys the
other, lends it and locks the difference — the trade the node says CIP is a *consequence of*. So
the basis clears against hedging demand and desk capacity only, with no arbitrageur on the other
side, and there is nothing to be a limit *to*. It is 17f's relative-value book, which names *"the
cross-currency basis (`fx-forward`'s CIP basis)"* as one of its comparables. **Already §3 step
17f.**

### Also marked, briefly

- **A1 ⚠️** — the profile satisfies the contract except D5 (one currency per contract) and delivery — A1.b above.
- **A1.d ❌** — every leg settles in `currencyOf(c.regionId)`; a currency per leg does not exist — `../instruments/derivative.md` D5.
- **C2 ⚠️** — a foreign book is funded by buying spot and holding it, an outright position rolled for ever — A4/D3.
