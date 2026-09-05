# INSTRUMENT CONTRACT: THE DERIVATIVE

Not a system — an **instrument contract**, the second after `bond.md`. Every tree whose instrument
is a derivative must satisfy all of it and say per node HOW. Cited by
`../systems/cds.md`, `../systems/interest-rate-swaps.md`, `../systems/fx-forwards-and-xcs.md` and
`../systems/commodity-futures.md`. The infrastructure they all run on — clearing, margin,
novation, netting — is `../systems/the-derivative-layer.md`, which is a system, not a contract.

**Why this file exists.** A derivative is not a claim on an issuer; it is a **bilateral obligation
between two parties, both of which can lose.** Every characteristic below follows from that one
difference, and an instrument missing any of them is not a derivative — it is a number moved
between two accounts for a reason nobody has written down.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## THE TWELVE

- **D1** REASON — **TWO NAMED COUNTERPARTIES**, and the contract is an asset to one and a
  liability to the other, at every instant
  - D1.a FORBID — **no derivative with one side.** A payoff received from nobody is invented money
  - D1.b VERIFY — Σ(mark-to-market) across all parties in a contract = 0, exactly. This is the
    invariant that distinguishes a derivative from a security
- **D2** REASON — a **NOTIONAL**, in a unit, which scales the payoff and is generally not exchanged
  - D2.a so the notional is **not the exposure**, and the two must never be conflated
- **D3** REASON — an **UNDERLYING** that is **observable and priced elsewhere**: a rate, a price,
  an index, a credit event (`../systems/the-clearing-engine.md` D1)
  - D3.a FORBID — **no underlying that only exists inside the derivative.** Then the payoff is
    unfalsifiable and the contract prices itself
- **D4** REASON — a **PAYOFF FUNCTION**: what one party owes the other as a function of D3
- **D5** REASON — a **CURRENCY** per leg, and the legs need not share one
  (`../systems/currency-and-fx.md` A3)
- **D6** REASON — **A TERM**: a start, an end, and payment dates in between
  - D6.a with a **periodicity and accrual convention** on any periodic leg (rule 8)
- **D7** REASON — a **PRICE AT INCEPTION**: the rate, spread or strike at which the two sides
  agree to enter
  - D7.a it is **cleared** from what the two sides were willing to do (rule 3), never solved for
  - D7.b many derivatives are struck **at par** — zero value at inception — and then the price IS
    the fixed rate or spread that makes it so. That is still a cleared price, and it must come out
    of a mechanism rather than out of the valuation formula run backwards
- **D8** REASON — a **MARK**: its value after inception, which moves and is not zero
  - D8.a and the mark is a **real gain to one party and a real loss to the other** (D1.b)
- **D9** REASON — **COLLATERAL AND MARGIN**: because D8 means one side is exposed to the other
  - D8/D9 together are why a derivative moves cash even when nothing has been paid on D4
  - D9.a posted collateral leaves the poster's free balance (`../systems/securities-lending.md` C4)
- **D10** REASON — **COUNTERPARTY CREDIT**: the other side can fail before the contract ends, and
  then the in-the-money party has a claim on an estate, not a payoff
  - D10.a which is why D9 exists, and why who you face is part of what the contract is worth
- **D11** REASON — **TERMINATION**: it expires, or is closed out, or is torn up — and on
  termination it **ceases to exist on both books at once**
  - D11.a early termination on default has a stated close-out value
- **D12** REASON — an **IDENTITY**: counterparties + underlying + term + strike. Two contracts on
  the same underlying with different strikes are two contracts

---

## WHAT A DERIVATIVE IS NOT

- **N1** FORBID — **it is not a holding.** It does not go in the issued-amount check
  (`../systems/the-register.md` B2) because nobody issued it; it goes in the zero-sum check (D1.b)
- **N2** FORBID — **it is not a way to get an exposure for free.** The cash it moves — margin, premium,
  periodic payments — is real and comes out of a real account
- **N3** FORBID — **it is not a substitute for the underlying market.** If the derivative's price is
  computed from a model and the cash market's price is computed from the derivative, neither has
  been cleared and rule 3 is broken in a loop

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`. The three FORBIDs of **WHAT A DERIVATIVE IS NOT** carry the ids `N1`–`N3`.

| Node | Code | |
|---|---|---|
| D1 two named counterparties, asset to one and liability to the other | `src/domain/derivatives/contract.ts:DerivativeContract` | ✅ |
| **D1.a FORBID no derivative with one side** | `src/engine/simulation/stages/12-portfolio-and-positions.ts:runPortfolioAndPositionsStage` · `src/engine/ledger/contract-ledger.ts:strikeDerivatives` | ✅ |
| **D1.b VERIFY Σ mark-to-market = 0, exactly** | — | ❌ |
| D2 a notional, in a unit, generally not exchanged | `src/domain/derivatives/contract.ts:notional` | ✅ |
| D2.a the notional is not the exposure | `src/domain/derivatives/registry.ts:standingPfeChargeLocal` | ⚠️ |
| D3 an observable underlying priced elsewhere | `src/domain/derivatives/profile.ts:DerivativeMarketView` | ✅ |
| **D3.a FORBID no underlying that only exists inside the derivative** | `src/engine/macro/evolution.ts:evolveCommodity` | ⚠️ |
| D4 a payoff function of D3 | `src/domain/derivatives/profile.ts:periodicLegUSDToB` | ✅ |
| D5 a currency per leg, legs need not share one | `src/engine/simulation/stages/derivative-lifecycle.ts:payThroughHouse` | ⚠️ |
| D6 a term: start, end, payment dates between | `src/domain/derivatives/contract.ts:maturityWeek` | ✅ |
| D6.a a periodicity and accrual convention per periodic leg | `src/domain/derivatives/classes/irs.ts:IRS_PROFILE` | ⚠️ |
| D7 a price at inception | `src/domain/derivatives/contract.ts:strike` | ✅ |
| D7.a cleared from what the two sides would do, never solved for | `src/engine/simulation/stages/financial-clearing-engine.ts:clearFinancialAsset` | ⚠️ |
| **D7.b struck at par: the price IS the rate, out of a mechanism** | `src/engine/simulation/stages/derivative-markets/irs.ts:runSwapMarket` | ✅ |
| D8 a mark after inception, which moves and is not zero | `src/domain/derivatives/profile.ts:markToMarketUSDToA` | ⚠️ |
| D8.a the mark is a real gain to one and a real loss to the other | `src/engine/simulation/stages/derivative-lifecycle.ts:settleDerivativeClass` | ✅ |
| D9 collateral and margin | `src/domain/derivatives/registry.ts:initialMarginAtStrike` | ⚠️ |
| D9.a posted collateral leaves the poster's free balance | `src/engine/simulation/stages/derivative-lifecycle.ts:initialMarginLocal` | ✅ |
| D10 counterparty credit: the other side can fail first | `src/engine/simulation/stages/derivative-lifecycle.ts:closeOutDerivativesOfParty` | ✅ |
| D10.a who you face is part of what the contract is worth | — | ❌ |
| D11 termination: it ceases to exist on both books at once | `src/domain/derivatives/profile.ts:eventTermination` | ✅ |
| D11.a early termination on default has a stated close-out value | `src/domain/derivatives/profile.ts:closeOutUSDToB` | ⚠️ |
| D12 an identity: counterparties + underlying + term + strike | `src/domain/derivatives/classes/option.ts:OPTION_PROFILE` · `src/engine/simulation/stages/derivative-lifecycle.ts:strikeDerivatives` | ✅ |
| N1 FORBID it is not a holding; it goes in the zero-sum check | `src/engine/audit/ownership.ts:o5` | ⚠️ |
| N2 FORBID it is not a free exposure — the cash is real | `src/engine/simulation/stages/settlement.ts:pay` | ⚠️ |
| N3 FORBID it is not a substitute for the underlying market | `src/engine2/stage08-back.ts:newCdsSpreadBps` | ⚠️ |

---

## 3. THE DIFF

### ✅ D1.a — CLOSED: THE LEGACY DERIVATIVE LAYER IS DELETED

*2026-09-05 (§9.17b-ii). The six position kinds below are gone from the player's layer —
`AssetType` is the five cash kinds, stage 12 marks equities, bonds, loans and FX spot and
nothing else, `pricing.ts` no longer prices a swap, protection or a basis swap by formula, the
dealer tables and the carry calculator carry no derivative kind, and the harness's scripted swap
and protection positions and the news feed's swap, protection and futures trade shortcuts went
with them. Every derivative in the model is a contract on the one book with a `b` side, struck
through `strikeDerivatives`; nothing marks against nobody. The player's own book is
37-SURFACE's — an actor is a party with an account whose orders are ordinary participants in
the books that clear — and its derivatives, when it has them, will be contracts like anyone's.
The paragraphs below are the state before it.*

*2026-09-05 (§9.17b-i). The one book can carry an option now: `classes/option.ts:OPTION_PROFILE`
— premium a periodic leg that fires once, in the strike week; the mark the option's value at the
name's own realised volatility; expiry an event termination at intrinsic value, exercised or
worthless; margin on the shares' own move; the reference the issuer's `SHARES`. Its market slot
(`derivative-markets/option.ts`) strikes nothing yet. The player's six kinds moving onto it, with
the player as a party, is 17b-ii; a market for anyone else's options is 17b-iii.*

`12-portfolio-and-positions.ts` runs a second, older derivative layer beside the one book, and it
is the node's exact opposite. Six position kinds — `IRS` (:246), `CDS` (:294), `TRS` (:350),
`COMMODITY` (:377), `OPTION` (:403), `XCS` (:466) — are priced by formula off
`reg.yieldCurveParams` (`pricing.ts:priceInterestRateSwap`, `priceCreditDefaultSwap`) and off
`fxPair.basisSpreadBps` (`priceCrossCurrencyBasisSwap`), none of them appears in
`state.derivativesBook`, and **none has a `b` side.** The gain settles: `12-portfolio:276`,
`:327`, `:496` do `ctx.weeklyRealizedPnL += unrealizedPnL`, and `13-news-and-turn-summary.ts:25`
adds that straight into `state.portfolio.cashLocal`. A payoff received from nobody, which is D1.a
verbatim.

**Consequence.** Every VERIFY node in this contract that sums across parties (D1.b) is unrunnable
while these positions exist, because their other half is not a party. It is also the one place in
the model where a derivative is a way to get an exposure for free (N2): no margin leaves an
account, no counterparty carries the mirror.

(§3 step 17b named the options only; the deletion took all six.)

### ❌ D1.b — NOTHING CHECKS THE ZERO-SUM, AND TWO OF FOUR CLASSES HAVE NO MARK TO SUM

Two separate holes behind one `❌`.

**The invariant is never measured.** The audit's seven families touch `state.derivativesBook`
exactly twice, and neither is this: `ownership.ts:260` (O8 — party and reference keys resolve) and
`ownership.ts:292` (O5 — both parties are alive). There is no check anywhere that Σ marks = 0 per
contract or in aggregate, and no check that Σ variation margin paid = Σ received. The zero-sum
holds by construction for the two mark-leg classes — `settleDerivativeClass`'s `settleMark` pays
one delta between the contract's own two parties — but *holding by construction* and *being
checked* are different claims, and the second is what D1.b asks for.

**Half the book has no mark at all.** `irs.ts:IRS_PROFILE` and `cds.ts:CDS_PROFILE` both set
`markToMarketUSDToA: () => null`. A swap or a protection contract therefore has no value between
inception and termination: it pays its periodic leg and is otherwise worth zero to both sides
until somebody dies. So D8 is `⚠️` and D1.b has nothing to sum over for two of the four classes.

The missing marks are **Already §3 step 17** (17-iii: variation margin is the mark for every
class; §9.17-ii already sizes initial margin from the reference's own move, so no class posts a
stated rate). The missing measurement is
**A measurement, for §3 step 38** — it is the one number that tells a derivative from a security
and no read produces it.

### ❌ D10.a — WHO YOU FACE IS WORTH NOTHING

No participant's reservation anywhere in the four markets contains a term for the counterparty.
`cds.ts:runCdsMarket` prices the *reference's* expected loss and the seller's capital charge;
`irs.ts:runSwapMarket` prices the receiver's alternative bond; `fx-forward.ts:strikeFor` picks the
dealer with the most remaining capacity (`pickDealerBank`, :426), which is a size test and not a
credit one. There is no CVA, no counterparty haircut, and no credit limit per pair.

**Consequence.** A hedger is indifferent between the strongest and the weakest dealer in its
region, so a weak dealer never loses flow and never pays for its weakness — and `cds.md` E2's
wrong-way risk (the protection seller correlated with the reference) cannot cost anybody anything,
because the identity of the seller is not in any price. It is the pricing half of what step 17's
CCP work assumes.

**§3 step 37-SMALL**, . Small as a mechanism (one term in four reservations), large in what it
enables: it is the first thing that makes D9's margin a *decision* rather than a stated rate.

### ⚠️ D7.a — THE FX FORWARD'S PRICE IS THE ONE THAT IS NOT CLEARED

Three of the four classes strike at what their auction printed (`irs.ts:189`, `cds.ts:212`,
`commodity-future.ts:252`). The fourth does not: `fx-forward.ts:353` sets

```
strike: ctx.getFxToUsd(issuer) * (1 - basisBps / 10000)
```

— spot moved by the cleared basis. The **basis** clears; the **forward rate** is a formula applied
to spot, and it carries no interest differential, so it is not covered interest parity either. See
`fx-forwards-and-xcs.md` §3, whose tree owns this finding (E1/B2).

### ⚠️ D5 / D6.a — ONE CURRENCY PER CONTRACT, ONE PERIODICITY, NO ACCRUAL CONVENTION

`derivative-lifecycle.ts:payThroughHouse` settles every leg in the contract's one `currency` — the contract has
a region, not a currency per leg. An FX forward's two currencies exist only inside its mark, which
is paid in the holder's home money, so a two-currency instrument (`fx-forwards-and-xcs.md` C1's
cross-currency swap) cannot be represented at all. Every periodic leg is `/52` — `irs.ts:44`,
`cds.ts:52` — so both legs of a swap share one weekly period and no accrual convention exists
(rule 8); `interest-rate-swaps.md` A2's mismatch, which is *part of the price*, has nowhere to
live. **§3 step 13-BOOK (d), and 28b for the convention**, and it is a prerequisite for 17b's XCS.

### ⚠️ D2.a — THE NOTIONAL *IS* THE EXPOSURE, THROUGH A FLAT RATE

The only measure of derivative exposure in the model is
`registry.ts:standingPfeChargeLocal` = Σ `notional × pfeAddOnRateOf(c)`, and the add-on is a
per-class constant (`irs.ts` 0.005, `fx-forward.ts` 0.02, `cds.ts`/`commodity-future.ts` 0.10,
with CDS's one investment-grade split). The mark never enters it. So the node's two things are not
conflated — but only because one of them (current exposure) does not exist: what the desk budget
charges is notional × a stated number, which is Basel's own CEM shape and is admitted by rule 2.
Recorded as diverging rather than absent; it closes with step 17's risk-based margin.

### ⚠️ N3 / D3.a — TWO PLACES WHERE THE DERIVATIVE AND THE CASH MARKET PRICE EACH OTHER

`stage08-back.ts:1872`: `newCdsSpreadBps = L8.cdsSpreadBps[row] > 0 ? L8.cdsSpreadBps[row] :
newOasBps` — a reference with no protection book this week carries the **bond's OAS as its CDS
spread**, and the basis for that name is zero by construction. (`pricing.ts:priceCreditDefaultSwap`
did it unconditionally for every player CDS, with a `recoveryRate = 0.40` default parameter, and
went with the legacy layer, §9.17b-ii.) **Already §3 step 26**, which names
`stage08-back.ts:1861` by line.

Separately, D3.a's underlying: the commodity futures book cash-settles to
`evolution.ts:evolveCommodity`'s spot, which is `spotPrice × exp(drift)` with a 0.5 floor — a
price nothing cleared. **Already §3 step 22.**

### Also marked, briefly

- **D11.a ⚠️** — the close-out value is the remaining nets at today's par, undiscounted — `interest-rate-swaps.md` section D.
- **N1 ⚠️** — `O5` keeps a derivative out of the issued-amount check by checking liveness, not the zero-sum — D1.b.
