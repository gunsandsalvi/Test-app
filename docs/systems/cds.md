# SYSTEM: CDS

Credit default swaps: protection on a named issuer's failure, paid for with a running premium. The
one derivative whose underlying is an **event** rather than a price, which is what makes it the
hardest to get right and the most useful when it is.

Satisfies `../instruments/derivative.md`; runs on `the-derivative-layer.md`.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. THE CONTRACT
- **A1** REASON — satisfies `../instruments/derivative.md`, answering these its own way:
  - A1.a **D3 underlying** — a **named reference entity** and its **default event**
    (`../instruments/bond.md` N12), not a price
  - A1.b **D4 payoff** — on the event, the protection seller pays **par − recovery** on the
    notional; otherwise nothing
  - A1.c **D7 price** — the **running spread**, in basis points per annum on the notional, cleared
  - A1.d **D6 term** — a stated tenor, and a **curve of them**: 1y, 3y, 5y, 10y, which is a term
    structure of credit and not one number
- **A2** REASON — the **premium leg is a real periodic payment**, in cash, in the contract's
  currency, and it stops on the event
- **A3** REASON — the **protection leg is contingent**, and its value is the probability-weighted
  loss — which is a **read from the cleared spread**, never the input to it (rule 3)
- **A4** REASON — the **reference entity must exist in this world** and be capable of defaulting
  (`corporate-credit.md`, `sovereign-credit.md`, `firm-birth-and-death.md`)
  - A4.a FORBID — no protection on an entity nobody can observe failing
- **A5** REASON — **the index**: a fixed basket of names traded as one line, which is how broad
  credit risk is actually bought and sold *(added 2026-09-05 from §3 step 17d, the user's words)*
  - A5.a the basket is a **series**: names fixed at the roll, and a name's event settles its
    **weight** once for every contract on the line, the line running on with the survivors
  - A5.b the index clears on its own book, and the **index-versus-single-name basis** — the print
    against the constituents' average — is a second measured relationship, never set

### B. WHY EACH SIDE IS THERE
- **B1** REASON — the **buyer of protection** has a reason: it holds the issuer's debt and wants
  the risk off, it lends to the issuer and cannot sell the loan, or it thinks the credit will
  deteriorate
  - B1.a so a bank can hedge a loan it cannot sell (`banks-lending.md`), which is the contract's
    original economic purpose
- **B2** REASON — the **seller of protection** has a reason: it wants credit exposure without
  funding a bond, or it thinks the spread is too wide for the risk
  - B2.a it is **short a jump**: small regular income, large sudden loss, which is why its capital
    and margin matter more than its mark
- **B3** REASON — **naked positions are possible** on both sides, and they are how the market gets
  liquid — but a naked seller is an unfunded credit exposure and must be capitalised as one
- **B4** REASON — a **dealer** intermediates (`dealer-desks.md`), and its book is rarely flat

### C. PRICE AND WHAT IS DERIVED FROM IT
- **C1** REASON — the **spread clears** from the two sides' schedules
  (`the-clearing-engine.md`)
- **C2** REASON — the **implied default probability and expected recovery are derived** from the
  spread and the term structure — never the other way round (rule 3, `../instruments/bond.md` N7.b)
- **C3** VERIFY — the CDS spread and the cash bond's spread over the risk-free curve should be
  close, because both are compensation for the same credit
  - C3.a the difference is the **basis**, and it is a **consequence** — of funding cost,
    deliverability, and who can trade which. It is measured, never set
  - C3.b a persistently large basis is a finding about one of the two markets, and rule 11 says
    not to judge it mid-project — but it must be visible
- **C4** VERIFY — worse credit should trade wider, as a consequence of what participants post

### D. THE EVENT
- **D1** REASON — a **stated definition of the credit event**, observable by both sides
  (`../instruments/bond.md` N12)
- **D2** REASON — a **recovery**, determined by what the defaulted obligations are actually worth
  — an auction, not an assumption
  - D2.a FORBID — **no fixed recovery rate.** A constant recovery makes the payoff a constant and
    turns a credit derivative into an interest-rate instrument
- **D3** REASON — the payment on the event is **real money from the seller to the buyer**, and it
  can be large enough to fail the seller
- **D4** REASON — the contract **terminates** on the event
  (`../instruments/derivative.md` D11)
- **D5** VERIFY — Σ(protection payments made) = Σ(received), and the net effect across the whole
  world of a default is a **transfer**, never a change in total loss

### E. THE SYSTEMIC PART
- **E1** REASON — CDS **moves credit risk to where it is not observed**: the bank looks hedged, and
  the risk sits with whoever sold it
- **E2** REASON — that seller may be **correlated with the reference entity** — wrong-way risk —
  and then the protection is worth least exactly when it is needed
- **E3** REASON — the **net notional per reference entity** is a real number and a real
  concentration, and it is knowable only by adding up the contracts
- **E4** FORBID — **no protection that pays without a payer.** The seller's ability to pay is part
  of the instrument (`../instruments/derivative.md` D10)

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 satisfies `../instruments/derivative.md` | `src/domain/derivatives/classes/cds.ts:CDS_PROFILE` | ✅ |
| A1.a D3 underlying — a named reference entity and its default event | `src/engine/simulation/stages/derivative-lifecycle.ts:buildDerivativeMarketView` | ✅ |
| A1.b D4 payoff — par − recovery on the notional | `src/domain/derivatives/classes/cds.ts:eventTermination` | ✅ |
| A1.c D7 price — the running spread in bps, cleared | `src/engine/simulation/stages/derivative-markets/cds.ts:runCdsMarket` | ✅ |
| A1.d D6 term — a stated tenor, and a CURVE of them | `src/domain/derivatives/classes/cds.ts:CDS_TENORS` · `src/domain/derivatives/classes/cds.ts:nearestCdsTenor` · `src/engine/simulation/stages/derivative-markets/cds.ts:runCdsMarket` | ✅ |
| A2 the premium leg is a real periodic payment, and it stops on the event | `src/domain/derivatives/classes/cds.ts:periodicLegUSDToB` | ✅ |
| A3 the protection leg is contingent; its value a read from the cleared spread | `src/domain/derivatives/classes/cds.ts:markToMarketUSDToA` | ✅ |
| A4 the reference entity exists here and can default | `src/engine/audit/ownership.ts:o8` | ✅ |
| A4.a FORBID no protection on an entity nobody can observe failing | `src/engine/audit/ownership.ts:o5` | ✅ |
| A5 the index: a fixed basket traded as one line | `src/domain/derivatives/classes/cds-index.ts:CDS_INDEX_PROFILE` · `src/engine/simulation/stages/derivative-markets/cds-index.ts:runCdsIndexMarket` | ✅ |
| A5.a a series: names fixed at the roll, a name's event settles its weight once for the line | `src/engine/simulation/stages/derivative-markets/cds-index.ts:runCdsIndexMarket` · `src/domain/derivatives/classes/cds-index.ts:pendingEventsOf` · `src/engine/simulation/stages/derivative-lifecycle.ts:settleDerivativeClass` | ✅ |
| A5.b the index clears, and the index-versus-single-name basis is measured | `src/domain/derivatives/classes/cds-index.ts:indexHolderQuote` · `src/domain/derivatives/classes/cds-index.ts:indexBasisBps` | ✅ |
| B1 the buyer of protection has a reason | `src/domain/derivatives/classes/cds.ts:protectionNeedLocal` · `src/engine/simulation/stages/derivative-markets/cds.ts:runCdsMarket` | ✅ |
| B1.a a bank hedges a loan it cannot sell | `src/domain/derivatives/classes/cds.ts:LARGE_EXPOSURE_LIMIT_OF_CAPITAL` | ✅ |
| B2 the seller of protection has a reason | `src/engine/simulation/stages/asset-allocation.ts:computeReservationSpreadBps` | ✅ |
| B2.a short a jump — capital and margin matter more than the mark | `src/domain/derivatives/classes/cds.ts:pfeAddOnRateFor` | ⚠️ |
| B3 naked positions are possible on both sides | `src/domain/institution-profiles.ts:quotesCdsProtection` · `src/domain/derivatives/classes/cds.ts:twoWayProtectionQuote` | ✅ |
| B4 a dealer intermediates, and its book is rarely flat | `src/domain/derivatives/classes/cds.ts:twoWayProtectionQuote` | ✅ |
| C1 the spread clears from the two sides' schedules | `src/engine/simulation/stages/financial-clearing-engine.ts:clearFinancialAsset` | ✅ |
| **C2 the implied default probability is DERIVED from the spread** | `src/engine/simulation/stages/shared-helpers.ts:computeAnnualDefaultProbability` | ❌ |
| C3 VERIFY the CDS spread and the cash bond's spread are close | `src/engine/audit/prices.ts:p2` | ✅ |
| C3.a the basis is a consequence, measured and never set | `src/engine/simulation/stages/derivative-markets/cds.ts:runCdsMarket` | ✅ |
| C3.b a persistently large basis must be visible | `src/engine/audit/prices.ts:p2` | ⚠️ |
| C4 VERIFY worse credit trades wider | `src/engine/audit/prices.ts:p3` | ⚠️ |
| D1 a stated definition of the credit event, observable by both sides | `src/engine/simulation/stages/derivative-lifecycle.ts:buildDerivativeMarketView` | ⚠️ |
| D2 a recovery from what the defaulted obligations fetch — an auction | `src/engine/simulation/stages/estate-resolution.ts:runEstateResolutionStage` · `src/domain/estate.ts:realisedUnsecuredRecoveryRate` · `src/engine/simulation/stages/derivative-lifecycle.ts:buildDerivativeMarketView` | ✅ |
| **D2.a FORBID no fixed recovery rate** | `src/domain/derivatives/classes/cds.ts:eventTermination` · `src/engine/simulation/stages/shared-helpers.ts:creditRecoveryRate` | ✅ |
| D3 the payment is real money, big enough to fail the seller | `src/engine/simulation/stages/derivative-lifecycle.ts:payThroughHouse` | ✅ |
| D4 the contract terminates on the event | `src/engine/simulation/stages/derivative-lifecycle.ts:settleDerivativeClass` | ✅ |
| D5 VERIFY Σ protection paid = Σ received; a default is a transfer | — | ❌ |
| E1 CDS moves credit risk to where it is not observed | `src/engine/simulation/stages/09-concentration-risk.ts:runConcentrationRiskStage` | ⚠️ |
| E2 wrong-way risk: the seller correlated with the reference | — | ❌ |
| E3 net notional per reference entity is a real concentration | `src/domain/derivatives/standing-book.ts:coverLocal` | ⚠️ |
| E4 FORBID no protection that pays without a payer | `src/engine/simulation/stages/derivative-lifecycle.ts:closeOutDerivativesOfParty` | ✅ |

---

## 3. THE DIFF

### ❌ C2 — THE DEFAULT PROBABILITY IS AN INPUT TO THE SPREAD, NOT A READ FROM IT

The node's arrow runs the wrong way in the code, and it is the load-bearing one.
`derivative-markets/cds.ts:88` computes `computeAnnualDefaultProbability(v2cds, c)` for every
reference **before the auction**, from the firm's own accounts —
`shared-helpers.ts:146` is `normalCdf(-distance / annualEbitdaVol(v2, comp))`, a
distance-to-default off EBITDA, coverage and cash. That PD is then fed into every seller's
reservation (`:130` and `:167`: `expectedLossBps: annualPd * (1 - recoveryRate) * 10000`), and the
auction clears the spread from those reservations. So the model's chain is

```
firm accounts → PD → reservation spread → cleared spread
```

and the node requires the last arrow reversed: **the cleared spread is the observable, and PD and
recovery are what you read out of it.** Nothing anywhere inverts the spread. `cdsSpreadBps` is
written at `:196` and read only as a level, a basis and a mark; no hazard rate, no survival curve,
no implied PD exists anywhere (the player's legacy pricer, which inverted the **bond's** OAS at a
default `recoveryRate = 0.40`, went with that layer — §9.17b-ii).

**Consequence.** The CDS market cannot disagree with the accounting model. Two names with the same
PD and rating clear at the same spread whatever the protection demand, and the whole content of
C3's basis is the *funding* difference between the two books — never a difference of opinion about
the credit, because there is only one opinion and it is a function. It is also why `..​/systems/
ratings-and-assessment.md`'s single-opinion problem (§3 step 36) has no market-side escape:
the spread is the rating's own arithmetic run forward.

**§3 step 37-CDS-DIRECTION**, . Medium: an inversion (spread → hazard → PD) plus deciding who reads it.
The natural pair for it is step 17f's registry of comparables, which needs an implied PD to state
what the CDS-versus-bond relationship *should* be.

### ✅ A5 / A5.a / A5.b — THE INDEX IS A SERIES, IT SETTLES, AND IT CLEARS

*2026-09-05 (§9.17d-ii).* The line clears on its own book (`runCdsIndexMarket`): an insurer or
pension fund under its corporate-credit target WRITES index protection for the gap and one over it
BUYS for the excess, each below its own reservation on the basket (`indexHolderQuote`); the desks
and the credit funds quote two-way at the basket's reservation — the mean of their single-name
reservations. The print joins `creditIndexSpreadHistoryBySeries` and the index-versus-single-name
basis is published as `Region.creditIndexBasisBps` (`indexBasisBps`), measured, never set.

*2026-09-05 (§9.17d-i).* The basket is a SERIES on the region (`Region.creditIndexSeries`): rolled
every `CDX_ROLL_WEEKS` from the names the single-name book has printed, equal-weighted and fixed
until the next roll; a constituent that fails settles its weight for the series once its workout
closes, at what the workout paid, and every contract on the line settles that event through the
lifecycle's new partial-event hook (`profile.ts:eventSettlement`), its `units` counting the
series' events it has settled. The class (`CDS_INDEX_PROFILE`) pays premium on the surviving
share, marks the spread move on it as a risky annuity plus a failed name's expected payoff, and
holds past maturity while a failed name's workout is open.

### ✅ A1.d — THE CURVE

*2026-09-05 (§9.17d-iii). Four tenors — `CDS_TENORS` 1y/3y/5y/10y, five the benchmark a name is
quoted by (`Company.cdsSpreadBps`) — and one instrument per (name, tenor)
(`cdsInstrumentId(region, issuer, tenor)`). A hedger strikes at the tenor nearest its exposure's
size-weighted remaining life (`nearestCdsTenor`: a loan's maturity, a receivable's due date, a
contract's weeks remaining); the quoters quote every tenor, each reservation at the capital charge
of its own tenor, which is what makes the curve a curve. The print history is per name and tenor
(`Region.cdsSpreadHistoryByIssuer`), the mark and the margin read the contract's own point, and P2
measures every tenor against the issuer's cash curve at the same point.*

The paragraph below is the state before it.

`classes/cds.ts:CDS_TENOR_WEEKS = 5 * 52` and every contract is struck with
`termKey: ''` (`derivative-markets/cds.ts:233`). One tenor, and the market clears one instrument
per reference entity (`cdsInstrumentId` is `${regionId}-CDS-${issuerId}`, with no tenor in the
key). The node asks for 1y/3y/5y/10y, *"which is a term structure of credit and not one number"*.

**Consequence.** Credit has no term dimension anywhere in the model: an issuer whose near-term
liquidity is fine and whose 10-year is doubtful is unrepresentable, and a curve inversion — the
single most informative thing a credit market prints before a default — cannot happen. It also
removes the tenor half of C2's inversion: a term structure is what you need to bootstrap hazard
rates from spreads at all.

**§3 step 17d**, . Small mechanically (the contract already carries `termKey`, and the swap
book proves the multi-tenor clearing shape works — `irs.ts:SWAP_TENORS`), meaningful in what it
opens. It belongs beside 17d's index, which is the other missing CDS product.

### ✅ D2 / D2.a — THE RECOVERY IS THIS ISSUER'S OWN WORKOUT

*2026-09-05 (§9.17-vi). The credit event settles at what the reference's own estate actually
paid its unsecured class (`estate.ts:realisedUnsecuredRecoveryRate` — the bonds and the paper,
not the secured lender): the lifecycle's view exposes the issuer's workout
(`buildDerivativeMarketView:issuerWorkout`, open or closed off `ctx.estates`), a triggered
contract WAITS while the estate is open — no premium, marked at the expected payoff at the
region's average so variation margin moves the bulk at the event, held past its maturity
(`profile.ts:holdsPastMaturity`) — and settles the true-up when the estate closes. Only an issuer
that left no estate settles at the region's average, and that is the stated fallback. Protection
on a firm whose assets fetch 5 cents now pays more than on one whose fetch 80, which is B2.a's
jump risk with a variance across names.*

The paragraph below is the state before it.


The FORBID is honoured in the way that matters most: **there is no fixed recovery rate in the
credit-event payoff.** `shared-helpers.ts:creditRecoveryRate` is the region's own realised
experience — `estate-resolution.ts:262` records what each workout actually paid, and the function
blends that rolling mean against a prior with weight `n/(n+8)`. `CREDIT_RECOVERY_RATE = 0.40`
(`domain/bank-pricing.ts`) survives only as that prior, which is what a lender must assume before
this world has resolved anything. The payoff really does move with what estates deliver.

**What diverges is the granularity.** `classes/cds.ts:eventTermination` pays
`notional × (1 − m.recoveryRate(c.regionId))` — the **region's** average, not the estate's own
workout on the name that just defaulted. The auction the node asks for exists
(`runEstateResolutionStage` sells the issuer's real assets and pays claims in order) and its
answer is discarded for this contract: protection on a firm whose assets fetch 5 cents pays
exactly the same as protection on one whose assets fetch 80. That is D2's *"an auction, not an
assumption"* failing on the last step, and it takes B2.a's jump risk with it — the seller's loss
has no variance across names.

**Already §3 step 17**, whose closing sentence names it: *"a credit event pays a REGIONAL AVERAGE
recovery (`cds.ts:58` + `derivative-lifecycle.ts:122`) instead of the estate's own workout on that
issuer."* Recorded here as the tree's second witness, and with the note that the FORBID itself is
satisfied — a reviewer scanning for "is there a recovery constant?" should find `0.40` and read
past it.

One smaller thing sits in the same place. `bootstrap/carriers.ts:362` seeds
`recoveryRate: 0.40, baselineRecoveryRate: 0.40` per company — a per-firm field that the CDS
payoff does not read. And the audit's own P2 hard-codes the prior: `prices.ts:59` reports when
realised recovery is more than 0.2 away from `0.4` with the message *"every spread is priced at
40%"*, which stopped being true when `creditRecoveryRate` started blending.

### ✅ B1 / B3 / B4 — TWO REASONS TO BUY, AND EVERY QUOTE IS TWO-WAY

*2026-09-05 (§9.17c). Three demands joined the one. A bank's exposure to a name is its loan book
AND its desk's paper on the name AND the protection the desk has written (`runCdsMarket`); a firm's
is its receivables on a buyer, the contracts it still has to deliver on and what it has paid a
supplier ahead — the invoices and contracts the lane already held, priced for the first time — at
the same large-exposure share of its own book equity (`protectionNeedLocal`). And every writer
quotes BOTH WAYS at its one reservation (`twoWayProtectionQuote`): it opens the auction holding
its short capacity of the credit, writes above the spread that covers its own cost of the risk and
buys below it, so a fund with a higher cost of capital than a desk buys what the desk writes — a
view, not a need, and the print is where two costs of capital meet. A name the market has printed
stays quoted whether or not anyone has to lay it off this week. What remains of B4 is the fee: the
desk quotes at its reservation with no spread of its own on the two sides, which is the
`dealer-desks.md` question, not this tree's.*

The paragraph below is the state before it.

The demand side of this market is a single formula applied to a single class of participant.
`runCdsMarket:56-80` builds hedge demand from **banks only**, and within a bank only from
`facilityRowsOf` — its loan book — through `protectionNeedLocal`, which is exposure above
`0.25 × bankEquityLocal` net of standing cover. Nobody else in the world can buy protection at all:
not a bank against its **bond** book, not a firm against a receivable, not a fund taking a view.

So B3's naked positions are one-sided: naked *sellers* exist and are properly motivated (credit
funds through `institution-profiles.ts:sellsCdsProtection`, sized by their own capital), and naked
*buyers* cannot exist, because every buyer's size is a regulatory need. And B4's dealer is not a
dealer: the bank desks appear only in the seller list, `dealerSpreadBps: 0` is passed to the
clearing engine (`:182`), and no participant quotes both ways — so a desk's book is not "rarely
flat", it is structurally one-sided.

**Already §3 step 17c**, which names all three missing demands (bank bond/desk exposure, a
non-financial's counterparty exposure, a manager taking a view) in the user's own words. This tree
adds one observation 17c does not make: with only a large-exposure *need* on the buy side, the
float this auction prices is a regulatory quantity rather than an opinion, and that is the second
reason (after C2) the spread cannot express a view.

### ❌ D5 / E2 / ⚠️ E3 — THREE THINGS NOBODY ADDS UP

**D5** (Σ protection paid = Σ received, and a default is a transfer). Never computed. It is true
by construction — `payThroughHouse` moves one amount from a member to the house and the same amount on to the other (§9.17-iv-b) — and it is exactly
the kind of "true by construction" that stops being true the first time a class settles twice.
**A measurement, for §3 step 38.**

**E3** (net notional per reference entity). `StandingBook.coverLocal` answers *"how much protection
does this party hold on this name"* — per party, per side. Nothing sums the book by reference
across the world, so the concentration the node calls "a real number and a real concentration" is
not a number anywhere. `09-concentration-risk.ts:runConcentrationRiskStage` measures a bank's
exposure concentration and does not see protection at all. **A measurement, for §3 step 38.**

**E2** (wrong-way risk) is not a measurement but a missing mechanism: nothing correlates a
seller's own solvency with the reference it wrote protection on, and — per
`../instruments/derivative.md` D10.a — the seller's identity is in no price, so it could not be
priced even if it were. **§3 step 37-SMALL**, and it is the same term D10.a needs.

### ⚠️ E1 — THE RISK MOVES, AND THEN NOBODY LOOKS

E1 is the system's point: the bank looks hedged and the risk sits with whoever sold it. The first
half works — `protectionNeedLocal` nets `alreadyHedgedLocal` off the bank's need, so a hedged bank
genuinely reports a smaller concentration. The second half has no reader:
`runConcentrationRiskStage` measures gross exposure per name and never adds the protection a fund
has written, so the risk arrives at the credit funds and is invisible from there on. Bank capital
is relieved (through `standingPfeChargeLocal`'s much smaller add-on) and no capital is raised
anywhere against the position it moved to. That asymmetry *is* E1, so the node is present as an
economics — and `⚠️` because it is present as an unmeasured one. Closes with E3's read.

### ⚠️ D1 — THE CREDIT EVENT IS A FLAG, AND AN ABSENT FIRM COUNTS AS A DEFAULT

`buildDerivativeMarketView`'s `isIssuerDefaulted` is `!c || !!c.isDefaulted` — the reference's own
boolean, with **"not found" treated as defaulted**. Two consequences. There is no *observable*
event in the node's sense (something both sides see and act on); and a reference that leaves
`updatedCompanies` for any reason other than default — a merger target, a firm that dropped out of
the private set — triggers a full par-less-recovery payout on every contract written on it. The
protection buyer is paid for an event that did not happen.

The `derivativesBook` re-key on merger (`10-mergers.ts:486`) covers the contract's *parties*; a
CDS's `referenceId` is not re-keyed there. **§3 step 34, and 13-BOOK (d) for the `referenceId` re-key**, small, and it pairs with §3 step
34 (*a credit event is only ever a missed payment*), which owns the definition side.

### Also marked, briefly

- **A1 ✅** (2026-09-05, §9.17d-iii) — the profile satisfies the contract: §9.17-ii/iii gave it initial margin off the name's own spread move and a weekly mark, §9.17-iv the clearing house, §9.17-vi the issuer's own recovery, §9.17d-iii the curve (A1.d).
- **A1.b ✅** (2026-09-05, §9.17-vi) — the payoff is `par − the ISSUER's own realised unsecured recovery`, settled when its estate closes — D2/D2.a above.
- **A3 ✅** (2026-09-05, §9.17-iii) — `cds.ts:markToMarketUSDToA` values protection every week as the spread move on a RISKY annuity: discounted at the overnight rate and survival-weighted at the hazard the cleared spread implies; the credit event nets what the mark already paid.
- **C3.b ⚠️** — `P2` reports the basis and fires only above a quota, so a persistently large one on a minority of names is invisible.
- **C4 ⚠️** — `P3` measures it with the same quota.
