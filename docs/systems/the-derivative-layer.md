# SYSTEM: THE DERIVATIVE LAYER

The infrastructure every derivative runs on: how a trade becomes an obligation, who stands between
the two sides, what margin moves, and what happens when a party fails. The contract common to the
instruments is `../instruments/derivative.md`; the individual instruments are `cds.md`,
`interest-rate-swaps.md`, `fx-forwards-and-xcs.md` and `commodity-futures.md`.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHY THE LAYER EXISTS
- **A1** REASON — a derivative is a **long-lived bilateral obligation**
  (`../instruments/derivative.md` D1), so the two sides remain exposed to each other for years
- **A2** REASON — that exposure has to be **managed**, and how it is managed is this system
- **A3** REASON — the same obligation appears **twice**, as an asset and a liability, and the two
  must be the same number read from two sides (rule 4)
- **A4** VERIFY — Σ marks = 0 across all parties, per contract and in aggregate
  (`../instruments/derivative.md` D1.b)

### B. HOW A TRADE BECOMES A POSITION
- **B1** REASON — two parties **agree terms** at a cleared price
  (`../instruments/derivative.md` D7)
- **B2** REASON — the position is **recorded on both books**, and it is one contract, not two
- **B3** REASON — it can be **closed** by an offsetting trade, by an early termination, or by
  running to expiry
  - B3.a an offsetting trade with a **different counterparty** does not remove the first: the
    party now has two contracts and two counterparty exposures, and the market risk is flat while
    the credit risk has doubled. Collapsing them hides the thing that actually breaks
- **B4** REASON — **novation** transfers a position to a new counterparty, with the old one's
  consent, and it is a real change of who faces whom

### C. BILATERAL VERSUS CLEARED
- **C1** REASON — **bilateral**: the two parties face each other, exchange collateral under an
  agreement, and net across the contracts they have with each other
  - C1.a netting is **per counterparty pair**, and it is why gross notional and net exposure are
    orders of magnitude apart
- **C2** REASON — **cleared**: a **central counterparty** steps in, becoming buyer to the seller
  and seller to the buyer, and then each side faces the CCP
  - C2.a it does not remove the risk; it **concentrates** it in a named party whose own solvency
    now matters to everyone
- **C3** REASON — the CCP is a **real entity with a balance sheet**: margin it holds, a default
  fund its members paid into, and its own capital
- **C4** REASON — it has a **stated default waterfall**, in order: the defaulter's margin, the
  defaulter's fund contribution, the CCP's own capital, the surviving members' contributions
  - C4.a which means a member's loss can come from **another member's** default, and that is the
    mutualisation channel
- **C5** FORBID — **the CCP is not a guarantor of last resort.** Its resources are finite and
  enumerable, and running past the end of the waterfall is a real event with real consequences,
  not an impossibility (`the-clearing-engine.md` B4)

### D. MARGIN
- **D1** REASON — **initial margin**: posted up front against a potential future move, sized from
  the risk of the position
- **D2** REASON — **variation margin**: the change in the mark, paid in cash, every period
  - D2.a it is **real money leaving one account and arriving in another**, in a stated currency,
    and it is the largest recurring flow this layer produces
  - D2.b VERIFY — Σ variation margin paid = Σ received, every period, exactly (A4 restated as a
    flow)
- **D3** REASON — margin is **held, not consumed**: the poster still owns it and gets it back, but
  it is no longer free (`../instruments/derivative.md` D9.a)
- **D4** REASON — a **margin call must be met or the position is closed out**
  - D4.a and meeting it may force a sale (`prime-brokerage.md` C3.a) — the same liquidity channel
- **D5** REASON — margin **rises when volatility rises**, which is exactly when parties can least
  afford it. That is procyclical by construction and it is a consequence to be measured

### E. DEFAULT
- **E1** REASON — a party can **fail with open positions**
- **E2** REASON — the positions are **closed out at a stated value**
  (`../instruments/derivative.md` D11.a) and the in-the-money side has a **claim on the estate**
- **E3** REASON — the loss is **the mark minus the collateral held**, and it lands on named
  survivors: the counterparty bilaterally, the waterfall if cleared (C4)
- **E4** VERIFY — the loss chain is traceable party by party; a default whose losses vanish is a
  layer that was never really bilateral

### F. WHAT MUST NOT HAPPEN
- **F1** FORBID — **no position without a counterparty** (`../instruments/derivative.md` D1.a)
- **F2** FORBID — **no exposure without margin or a stated reason there is none**
- **F3** FORBID — **no netting across counterparties.** Exposure to A does not offset exposure to
  B, and treating it as if it does is how a book looks flat until one of them fails
- **F4** FORBID — **no derivative that settles against a price this world does not clear**
  (`../instruments/derivative.md` D3.a)

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a long-lived bilateral obligation | `src/engine2/obligations.ts:ObligationStore` · `src/domain/derivatives/contract.ts:DerivativeContract` · `src/domain/derivatives/contract.ts:DerivativeReference` | ✅ |
| A2 the exposure is managed, and how is this system | `src/engine/simulation/stages/derivatives.ts:runDerivativesStage` · `src/engine/simulation/stages/derivative-markets/option.ts:OPTION_MARKET` | ✅ |
| A3 the same obligation twice, one number from two sides | `src/engine/simulation/stages/derivative-lifecycle.ts:payThroughHouse` | ✅ |
| A4 VERIFY Σ marks = 0 per contract and in aggregate | `src/engine/audit/ownership.ts:o9` | ✅ |
| B1 two parties agree terms at a cleared price | `src/engine/simulation/stages/financial-clearing-engine.ts:clearFinancialAsset` | ✅ |
| B2 recorded on both books; one contract, not two | `src/engine/ledger/contract-ledger.ts:strikeDerivatives` | ✅ |
| B3 closed by an offset, an early termination, or expiry | `src/engine/simulation/stages/derivative-lifecycle.ts:settleDerivativeClass` | ⚠️ |
| B3.a an offset with a different counterparty does not remove the first | `src/domain/derivatives/standing-book.ts:StandingBook` | ✅ |
| B4 novation, with the old counterparty's consent | `src/engine/simulation/stages/10-mergers.ts:runMergersStage` | ⚠️ |
| C1 bilateral: face each other, exchange collateral, net per pair | — | ❌ |
| C1.a netting is per counterparty pair | — | ❌ |
| **C2 cleared: a CCP becomes buyer to the seller and seller to the buyer** | `src/engine/simulation/stages/derivative-lifecycle.ts:payThroughHouse` · `src/engine/simulation/stages/derivative-lifecycle.ts:postInitialMargin` | ✅ |
| C2.a it concentrates the risk in a named party | `src/engine/simulation/stages/derivative-lifecycle.ts:closeOutDerivativesOfParty` · `src/engine/audit/ownership.ts:o15` | ✅ |
| C3 the CCP is a real entity with a balance sheet | `src/domain/clearing-house.ts:CcpSheet` · `src/engine/ledger/contract-ledger.ts:ccpFundOf` · `src/engine/simulation/stages/derivatives.ts:trueUpDefaultFunds` · `src/engine/ledger/contract-ledger.ts:houseViewOf` · `src/ui/functions/derivatives.tsx:derivatives` | ✅ |
| **C4 a stated default waterfall, in order** | `src/domain/clearing-house.ts:runWaterfall` · `src/engine/simulation/stages/derivative-lifecycle.ts:resolveMemberDefault` | ✅ |
| C4.a a member's loss can come from another member's default | `src/domain/clearing-house.ts:writeDownSurvivors` | ✅ |
| **C5 FORBID the CCP is not a guarantor of last resort** | `src/domain/clearing-house.ts:WaterfallRound` · `src/domain/clearing-house.ts:memberMarginLimitLocal` · `src/engine/audit/ownership.ts:o15` | ⚠️ |
| D1 initial margin, sized from the risk of the position | `src/domain/derivatives/registry.ts:initialMarginAtStrike` | ✅ |
| D2 variation margin: the change in the mark, in cash, every period | `src/engine/simulation/stages/derivative-lifecycle.ts:settleMark` | ✅ |
| D2.a real money leaving one account and arriving in another | `src/engine/simulation/stages/settlement.ts:pay` | ✅ |
| D2.b VERIFY Σ VM paid = Σ received, every period | `src/engine/audit/ownership.ts:o9` | ⚠️ |
| D3 margin is held, not consumed; the poster gets it back | `src/domain/clearing-house.ts:ccpOfContract` · `src/engine/simulation/stages/derivative-lifecycle.ts:releaseInitialMargin` · `src/engine/audit/ownership.ts:o15` | ✅ |
| D4 a margin call must be met or the position is closed out | `src/engine/simulation/stages/overdraft-sweep.ts:runOverdraftSweep` | ⚠️ |
| D4.a meeting it may force a sale | `src/engine/simulation/stages/prime-brokerage.ts:runPrimeBrokerageCloseSweep` | ⚠️ |
| D5 margin rises when volatility rises — procyclical, measured | `src/domain/derivatives/profile.ts:closeOutMoveOf` | ⚠️ |
| E1 a party can fail with open positions | `src/engine/simulation/stages/derivative-lifecycle.ts:closeOutDerivativesOfParty` | ✅ |
| E2 closed out at a stated value; a claim on the estate | `src/engine/simulation/stages/estate-resolution.ts:runEstateResolutionStage` · `src/domain/estate.ts:ClaimHolder` | ✅ |
| E3 the loss is the mark less collateral, on named survivors | `src/domain/clearing-house.ts:runWaterfall` | ✅ |
| E4 VERIFY the loss chain is traceable party by party | `src/domain/clearing-house.ts:WaterfallRound` | ⚠️ |
| F1 FORBID no position without a counterparty | `src/engine/audit/ownership.ts:o5` | ✅ |
| F2 FORBID no exposure without margin or a stated reason | `src/domain/derivatives/profile.ts:closeOutMoveOf` | ⚠️ |
| **F3 FORBID no netting across counterparties** | `src/domain/derivatives/registry.ts:standingPfeChargeLocal` | ✅ |
| F4 FORBID nothing settles against a price this world does not clear | `src/engine/macro/evolution.ts:evolveCommodity` | ⚠️ |

---

## 3. THE DIFF

### ✅ A1 — CLOSED: A CONTRACT'S REFERENCE IS TYPED BY CLASS (§9.13-BOOK dIIb)

`DerivativeContract.referenceId` was a `string` holding four id spaces — an entity id from the CDS
book, a commodity id from the future, a REGION from the FX forward, the empty string from the
swap — discriminated by `classId` and by nothing the compiler could see, so `DerivativeMarketView`'s
issuer accessors took a `string` and were right only on the CDS path (found at §9.13-BOOK
c-then-1 by branding the entity index's key). It is `reference: DerivativeReference` now: each
class states its own arm (`ISSUER` with an `EntityId`, `COMMODITY`, `REGION`, `RATE`), the
accessors take an `EntityId` and nothing is cast, a class profile asks for its own arm through
`issuerReferenceOf` / `commodityReferenceOf` / `regionReferenceOf` and defects on any other, and
the standing book keys cover by `referenceKeyOf` — the same strings the field held, so every
cover lookup is unchanged. `O8`'s dead-reference arm and the UI read the arm rather than probing
two stores to guess which space a string was in.

`DerivativeParty` was a second party union re-declaring three of `PartyRef`'s arms; it is
`CounterpartyRef`, an `Extract` view of the one union, since §9.13-BOOK c-then-3a.

### ✅ C2, C3, C4 / ⚠️ C5 — THE HOUSE HAS ITS STACK, AND RUNS IT IN ORDER

*2026-09-05 (§9.17-iv-c-ii). A member's default is the house's waterfall
(`derivative-lifecycle.ts:resolveMemberDefault`, from the estate's opening and from the settle's
dead branch alike): the house pays every survivor in full at the mark, nets what the defaulter
owed it across the defaulter's contracts at that house, and recovers in the stated order
(`clearing-house.ts:runWaterfall`) — the defaulter's margin, which the house kept rather than
returned; its fund contribution; the house's own capital; the survivors' contributions, written
down pro rata (`writeDownSurvivors`; a bank survivor books it against equity, C4.a's channel
made of a real loss on a real sheet). What the defaulter's own money did not cover is the house's
UNSECURED claim on the estate (E2, below). Past the end the house is short of what it owes its
members: `O15` reports it and the news tells it (`news-derivation.ts` 7e), and every round is a
record on the region (`Region.lastWaterfall`). C5 is ⚠️ for one honest reason: a survivor is
still paid in full past the end — the house's cash goes negative where a real one would haircut
the survivors' gains — so the stack is finite and enumerable but running past it hurts the
house's books rather than a member's.*

*2026-09-05 (§9.17-iv-c-i). The sheet has its three lines. The DEFAULT FUND is rows of the
contract store (`clearing-house.ts:CcpFundContribution`, kind `CCP_FUND`, one per member per
house; `contract-ledger.ts:ccpFundOf` / `publishCcpFund`), sized cover-one — the largest member's
move over a five-session close-out beyond the margin it posted (`coverOneFundLocal`,
`CCP_CLOSE_OUT_SESSIONS`) — and shared pro rata to each member's margin (`fundContributionsOf`).
`derivatives.ts:trueUpDefaultFunds` settles every member to its share after the week's last
market, in and out, through the account its margin moves through, so a bank's asset at the house
is margin plus fund (`contract-ledger.ts:bankAtHouseLocal`). The house's OWN CAPITAL is what it
holds beyond its members' money (`ccpOwnCapitalLocal` — it has no shareholders and charges no
fee, so its capital is what it retained), and `O15` holds cash to margin plus fund. What the
stack still lacks is an ORDER: 17-iv-c-ii.*

*2026-09-05 (§9.17-iv-b). Novated. No member pays another: `payThroughHouse` writes every leg —
periodic, mark, event, close-out — as the paying member to the house of the contract's money and
the house to the other member, so each side faces the house and the house is flat on every leg by
construction. Both members post initial margin (`postInitialMargin`; the house holds it twice
over), a bank from its securities account, carrying the margin as an asset beside its register
books (`contract-ledger.ts:bankMarginAtHouseLocal` in `desk-register.ts:bankBookAssetsLocal`).
C2.a: the risk concentrates in the house — a member that has ceased to exist pays nothing and the
house still pays the survivor (`closeOutDerivativesOfParty`), so the loss is the house's, which
`O15` shows as cash short of margin until 17-iv-c gives it a waterfall. C1 goes to ❌ for the
honest reason: there is no bilateral book left to net per pair.*

*2026-09-05 (§9.17-iv-a). The region's derivatives clearing house is a party (`party.ts` kind
`CCP`, keyed by region — NOT the cash books' `CLEARING_HOUSE`, which stays a pass-through) with
cash: rows at the region's banks carried like a sector's, landing by market share
(`accounts.ts:buildAccountMirror`), a deposit line on each bank (`DepositLines.ccpLocal`). Every
contract's initial margin is posted TO the house of the contract's money
(`clearing-house.ts:ccpOfContract`) and returned BY it, whoever the B side is, so the dealer's
`clientMarginLocal` line and the lien on its securities account are gone. Its sheet
(`clearing-house.ts:CcpSheet`, read by `contract-ledger.ts:ccpSheetAt`) is cash held against
margin held, and `O15` holds the cash to the contracts. ⚠️ at the time because C3 names three
lines and this was one of them; the default fund and the house's own capital came with 17-iv-c-i.*

*2026-09-05 (§9.17-v-i). The house sets each member a LIMIT: it may carry at the houses no more
initial margin than its liquid cash could re-margin over the close-out horizon
(`clearing-house.ts:memberMarginLimitLocal`, cash ÷ (√5 − 1)), a hedger and a dealer alike; a
dealer's PFE budget off its leverage headroom stays as its own capital's second constraint.
Rule 5 puts the limit at the strike: `derivative-lifecycle.ts:admitContract` cuts a contract to
the smaller of its two members' remaining capacity, or refuses it, before it stands and posts —
every market strikes through `admitToHouse` (the FX market per holder, where its weaker
per-holder budget stood) — and what was cut is `Region.ccpRefusedNotionalLocal`, a §6 measure.
Since §9.17-v-iii the markets SIZE to the limit before the print: each caps a party's demand and
a desk's supply at the member's remaining capacity through the strike's margin rate
(`registry.ts:initialMarginRateOf`, `derivative-lifecycle.ts:memberNotionalCapacityLocal`),
reserving what it sized, so the cut at the strike is the exception and the refused notional
measures it.*

*2026-09-05 (§9.17-v-ii). The market view: `contract-ledger.ts:houseViewOf` reads one house's open
interest by class, its sheet, and every member with the margin and fund it has at the house and
its gross and net position per class (the class's first role long, the other side short); the
region's `derivatives` function shows it and `DRV_TRACE=1` prints it, the week's refusals and
the latest waterfall beside.*

### ✅ E2 / E3 / ⚠️ E4 — A DEAD MEMBER'S CLOSE-OUT IS THE HOUSE'S CLAIM, RANKED, AND ITS LOSS IS NAMED

*2026-09-05 (§9.17-iv-c-ii). Nothing is paid out of the estate's cash at the close-out any more.
The house pays the survivors and takes the loss through its stack; what the defaulter's own
margin and contribution did not cover becomes one claim on the estate — holder the house
(`estate.ts:ClaimHolder` admits the `CCP` arm), type `DERIVATIVE_CLOSE_OUT`, UNSECURED, ranking
with the bonds in `distribute` and written off with them. E2 is the node as written. E3: the
loss is the mark net of the margin, and it lands by name — the house's capital, then each
survivor's contribution pro rata, a bank's against its equity. E4 is ⚠️ because the round records
the LINES (`WaterfallRound`: margin, fund, capital, survivors, unfunded, claim) and not each
survivor's share; the fund rows carry that, but nothing keeps them from one week to the next.
The super-seniority the paragraph below recorded is gone with the payoff.*

Before this, `estate-resolution.ts` called `closeOutDerivativesOfParty` at the moment the estate
was opened and that function `pay()`ed the replacement value straight out of the defaulted
party's account, ahead of a claim list that carried five instrument types and no derivative —
an accidental super-seniority created by call order. **§3 step 37-ESTATE** named it; it closed
with the waterfall rather than on its own.

### ✅ A4 / ⚠️ D2.b — EVERY CLASS MARKS, AND THE MARKS ARE SUMMED

2026-09-05 (§9.17-iii). `IRS` and `CDS` mark now — a swap as the discounted remaining fixed-leg
difference at par (`irs.ts:markToMarketUSDToA`), protection as the spread move on a risky
annuity (`cds.ts:markToMarketUSDToA`) — and every contract carries `settledMarkLocal` from strike,
so `O9` (`audit/ownership.ts:o9`: Σ settled marks across parties = 0, no contract faces itself,
every contract carries a mark) is no longer vacuous on half the book: A4 is measured. D2.b — Σ
variation margin paid = Σ received — holds by construction (each mark delta is one instruction
between the contract's two parties through `settleMark`) and is not separately summed; that sum is
§3 step 38's measurement.

### ✅ D1 / ⚠️ F2 / ⚠️ D5 — MARGIN IS THE REFERENCE'S OWN MOVE, AT STRIKE

*2026-09-05 (§9.17-i, ii). The margin a contract carries is the amount POSTED at strike, a fact of
the contract (`contract.ts:initialMarginLocal`, a column of the obligation store), posted through
one path for every class (`derivative-lifecycle.ts:postInitialMargin`) and read — never
re-derived — by the lien, the audit and the release. What a strike posts is the reference's own
measured move over one session on the contract's sensitivity to it
(`profile.ts:closeOutMoveOf`: a commodity's or a pair's realised weekly move on the notional, a
tenor's rate move in bps on a swap's remaining life, a name's spread move on the protection's
remaining life — the CDS book now keeps each name's print history for it), so `initialMarginRate`
is gone and no class posts a stated rate. What remains: a contract is margined once, at strike —
D5 rises for NEW contracts as volatility rises, but a live contract is never re-margined (17-iv,
the CCP, is where a daily call belongs); and a reference on its first print posts nothing, which
is F2's stated reason rather than a rate.*

`profile.ts:initialMarginRate` is a flat per-class constant: `0` for IRS, CDS and commodity
futures, `0.02` for FX forwards (`classes/*.ts`). Nothing reads volatility, a close-out horizon or
a netting set. D5 — margin rises with volatility, procyclically — therefore has no mechanism at
all: the one number that would move is a literal.

F2 is `⚠️` rather than `❌` on a technicality worth stating: three classes carry exposure with no
margin, which the node forbids *unless there is a stated reason*, and there is one — step 17 says
so explicitly. A stated reason to be uncollateralised is not the same as being collateralised, and
the row says `⚠️`.

**Already §3 step 17**, which requires initial margin to be *"the reference's own volatility over
a close-out horizon, scaled by the portfolio's netting"*.

### ⚠️ D4 / D4.a — A MARGIN CALL IS ALWAYS MET, BECAUSE IT BECOMES A LOAN

`payThroughHouse` journals the variation-margin leg unconditionally; there is no cash test and no failure
path. A payer who cannot fund it goes negative and `overdraft-sweep.ts:runOverdraftSweep` converts
the shortfall into credit — a revolver draw for a firm, a prime-brokerage draw for a fund
(`prime-brokerage.ts:runPrimeBrokerageCloseSweep`), an SME facility for a pool. That is a real
answer to the *first* half of D4 and it is a good one: the money has a lender.

**The second half has no code at all.** No position is ever closed for non-payment; the only
close-out triggers in `settleDerivativeClass` are maturity, a profile event, and a counterparty
that is already dead. And D4.a's forced sale does not exist either — the PB sweep draws the line,
it never liquidates a holding. So the liquidity channel the node names (`prime-brokerage.md`
C3.a — margin call → forced sale → price impact) is open at one end: a margin call always
produces borrowing and never produces selling.

**§3 step 37-MARGIN**, . It is the missing half of step 17's margin work and should be built with
it: risk-based margin with no failure path is a bigger number that still cannot fail.

### ❌ C1 / C1.a — NO BILATERAL BOOK, AND NO NETTING SET

*2026-09-05 (§9.17-iv-b). Every contract clears: no member faces another, so the bilateral arm
of the tree is absent rather than half-built, and C1 says so. C1.a's netting per pair is what a
bilateral book would need; the cleared book's netting is a per-member figure the house keeps,
which is 17-v's member view.*

The layer was bilateral, but only in the weak sense that each row named two parties. There is no
CSA, no netting set, and no per-pair exposure anywhere: `settleDerivativeClass` pays **every
contract's leg separately**, gross, so two parties with ten offsetting contracts send ten wires.
C1.a's point — that gross notional and net exposure are orders of magnitude apart — has no number
in this model at all, because net exposure per pair is never computed.

This is the mirror of F3 being clean, and both close with step 17: a netting set is what a CCP
membership is. Recorded here so that when 17 lands, the bilateral case is not left as the
untouched half. **Already §3 step 17.**

### ✅ F3 — NO NETTING ACROSS COUNTERPARTIES, AND THIS ONE IS HONESTLY CLEAN

The tree's sharpest FORBID, and the code obeys it. `registry.ts:standingPfeChargeLocal` and
`standing-book.ts`'s `add` charge a party for **every live contract it stands on, on either
side**, at the class's add-on, with no offsetting whatever — `if (bKey !== aKey)` charges both
parties, and a long and a short in the same name against different counterparties consume the desk
budget twice. `deskNotionalCapacityLocal` then spends that gross charge. Nothing nets an exposure to
A against an exposure to B anywhere in the four markets.

The one net figure in the layer is `dealer-derivatives.ts:FxDealerBook.netNotionalByRegion`, and
it is not a credit exposure: it is the desk's *market* position by currency, which
`fx-clearing.ts` hedges in spot. Netting market risk across clients is what a desk does; netting
credit exposure across them is what the node forbids, and the code does the first and not the
second.

### ⚠️ B3 / B4 — A CONTRACT CAN ONLY LEAVE BY DYING

B3 names three exits and the code has one and a half. Expiry works (`settleDerivativeClass`'s
maturity branch) and a profile event works (`eventTermination`). **An offsetting trade never
closes a position** — `strikeDerivatives` only appends, and no market ever writes a closing
ticket — and **there is no voluntary early termination**: nobody can tear up a contract it no
longer wants. A hedger whose exposure has gone away keeps paying its swap to maturity.

B3.a is nevertheless `✅`, and worth saying plainly: `StandingBook` nets a party's cover *for
sizing the next hedge* while leaving both contracts standing in the book, which is exactly the
distinction the node draws.

B4's novation is `⚠️` for a different reason: `10-mergers.ts:486` and `bank-resolution.ts:98`
re-key both parties of every contract onto the acquirer, which is a novation with no consent
sought and no counterparty able to refuse. That is defensible for a merger and a resolution — they
are the two cases where consent is legally overridden — but it means the node's *consensual*
novation, the one that is a real change of who faces whom by choice, has no code. **§3 step
17**, small, and naturally part of its clearing-member work.

### ⚠️ E4 — THE LOSS CHAIN IS TRACEABLE BY LINE, NOT YET BY SURVIVOR

*2026-09-05 (§9.17-iv-c-ii). `closeOutDerivativesOfParty` returns the rounds, and each round
(`clearing-house.ts:WaterfallRound`, kept as `Region.lastWaterfall`) says who defaulted, what it
owed, and what each line of the stack paid — margin, fund, capital, survivors, unfunded, the claim
on the estate. What it does not keep is each SURVIVOR's share of the write-down: that is in the
fund rows the round rewrote, and nothing carries it from one week to the next. A measurement,
for §3 step 38 — the node is a VERIFY, and what it wants is a read of the chain party by party.*

### ✅ D3 — CLOSED: THE MARGIN IS THE CLEARING HOUSE'S CASH WHILE IT IS HELD (§9.17-iv-a)

*2026-09-05. The margin is held by the party that should hold it. §9.13-BOOK d5c had it on the
DEALER's securities account under a lien the contract ledger kept equal to the dealer's live
contracts, with the sheet's `clientMarginLocal` a read of the lien and `O13` checking it; a
dealer holding its own clients' margin is the bilateral world's arrangement, and it is gone.
`postInitialMargin` pays it to the house of the contract's money (`clearing-house.ts:ccpOfContract`),
`releaseInitialMargin` has the house return it when the contract ends, and `O15` holds the
house's cash to the margin its live contracts posted — cash above it is a departed member's
margin the house keeps, cash below it is a payment the lifecycle did not make. The poster's
claim therefore exists in one place, on the party that owes it. What the poster's own NAV read
does with that claim is `hedge-funds.md`'s B5 (gross, net and equity as three reads).*

### Also marked, briefly

- **D2 ✅** — variation margin flows for every class (§9.17-iii gave IRS and CDS their marks) — A4/D2.b.
- **F1 ✅** (2026-09-05, §9.17b-ii) — `O5` checks both parties are alive for the one book, and the one book is the only derivative layer: the player's legacy positions, which had no `b` at all, are deleted — `../instruments/derivative.md` D1.a.
- **F4 ⚠️** — the commodity future cash-settles to `evolveCommodity`'s formula spot — 37-COMMODITY.
