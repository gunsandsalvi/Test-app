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
| A1 a long-lived bilateral obligation | `src/domain/derivatives/contract.ts:DerivativeContract` | ✅ |
| A2 the exposure is managed, and how is this system | `src/engine/simulation/stages/derivatives.ts:runDerivativesStage` | ✅ |
| A3 the same obligation twice, one number from two sides | `src/engine/simulation/stages/derivative-lifecycle.ts:payToB` | ✅ |
| **A4 VERIFY Σ marks = 0 per contract and in aggregate** | — | ❌ |
| B1 two parties agree terms at a cleared price | `src/engine/simulation/stages/financial-clearing-engine.ts:clearFinancialAsset` | ✅ |
| B2 recorded on both books; one contract, not two | `src/engine/simulation/stages/derivative-lifecycle.ts:strikeDerivatives` | ✅ |
| B3 closed by an offset, an early termination, or expiry | `src/engine/simulation/stages/derivative-lifecycle.ts:settleDerivativeClass` | ⚠️ |
| B3.a an offset with a different counterparty does not remove the first | `src/domain/derivatives/standing-book.ts:StandingBook` | ✅ |
| B4 novation, with the old counterparty's consent | `src/engine/simulation/stages/10-mergers.ts:runMergersStage` | ⚠️ |
| C1 bilateral: face each other, exchange collateral, net per pair | `src/engine/simulation/stages/derivative-lifecycle.ts:settleDerivativeClass` | ⚠️ |
| C1.a netting is per counterparty pair | — | ❌ |
| **C2 cleared: a CCP becomes buyer to the seller and seller to the buyer** | — | ❌ |
| C2.a it concentrates the risk in a named party | — | ❌ |
| C3 the CCP is a real entity with a balance sheet | — | ❌ |
| **C4 a stated default waterfall, in order** | — | ❌ |
| C4.a a member's loss can come from another member's default | — | ❌ |
| **C5 FORBID the CCP is not a guarantor of last resort** | — | ❌ |
| D1 initial margin, sized from the risk of the position | `src/domain/derivatives/profile.ts:initialMarginRate` | ⚠️ |
| **D2 variation margin: the change in the mark, in cash, every period** | `src/engine/simulation/stages/derivative-lifecycle.ts:settleMark` | ⚠️ |
| D2.a real money leaving one account and arriving in another | `src/engine/simulation/stages/settlement.ts:pay` | ✅ |
| **D2.b VERIFY Σ VM paid = Σ received, every period** | — | ❌ |
| D3 margin is held, not consumed; the poster gets it back | `src/engine/simulation/stages/derivative-lifecycle.ts:releaseInitialMargin` | ⚠️ |
| D4 a margin call must be met or the position is closed out | `src/engine/simulation/stages/overdraft-sweep.ts:runOverdraftSweep` | ⚠️ |
| D4.a meeting it may force a sale | `src/engine/simulation/stages/prime-brokerage.ts:runPrimeBrokerageCloseSweep` | ⚠️ |
| D5 margin rises when volatility rises — procyclical, measured | — | ❌ |
| E1 a party can fail with open positions | `src/engine/simulation/stages/derivative-lifecycle.ts:closeOutDerivativesOfParty` | ✅ |
| E2 closed out at a stated value; a claim on the estate | `src/engine/simulation/stages/estate-resolution.ts:runEstateResolutionStage` | ⚠️ |
| E3 the loss is the mark less collateral, on named survivors | `src/domain/derivatives/profile.ts:closeOutUSDToB` | ⚠️ |
| E4 VERIFY the loss chain is traceable party by party | — | ❌ |
| F1 FORBID no position without a counterparty | `src/engine/audit/ownership.ts:o5` | ⚠️ |
| F2 FORBID no exposure without margin or a stated reason | `src/domain/derivatives/profile.ts:initialMarginRate` | ⚠️ |
| **F3 FORBID no netting across counterparties** | `src/domain/derivatives/registry.ts:standingPfeChargeUSD` | ✅ |
| F4 FORBID nothing settles against a price this world does not clear | `src/engine/macro/evolution.ts:evolveCommodity` | ⚠️ |

---

## 3. THE DIFF

### ❌ C2–C5 — THERE IS NO CENTRAL COUNTERPARTY, SO SECTION C IS HALF A SYSTEM

Every contract in `derivativesBook` is bilateral (`contract.ts` `a`/`b`), and the model has no
CCP for derivatives at all: no default fund, no member contributions, no waterfall, no clearing
member. The `CLEARING_HOUSE` party that does exist
(`ledger/accounts.ts:clearingHouseResidualUSD`, `audit/wires.ts` W2) is the **cash books'**
settlement pass-through — flat by construction, holding no margin and bearing no loss — and the
only waterfall in `src` is the estate's (`estate-resolution.ts:374`, secured → unsecured →
equity), which is an issuer's liquidation and not a clearing house's.

**Consequence.** C4.a's mutualisation channel — a member losing money because a *different*
member failed — does not exist in this world, so the largest systemic transmission a derivative
layer has is unrepresentable. And C5, the tree's hardest FORBID, is unanswerable rather than
satisfied: there is no finite enumerable resource stack to run past, because there is no stack.

**Already §3 step 17**, in its own words: *"Novate every contract to the region's CCP: each side
faces the CCP, initial margin is posted TO it, variation flows THROUGH it, and a default is its
waterfall (IM → default fund → mutualisation) rather than a bilateral close-out."* Recorded here
as five nodes rather than one line, because C3 (the CCP's own balance sheet) and C5 (finite
resources) are separable pieces of that step and are the ones a partial implementation drops.

### ⚠️ E2 / E3 — A DEAD PARTY'S DERIVATIVES ARE PAID IN FULL, AHEAD OF EVERY RANKED CLAIM

The node says the in-the-money side has **a claim on an estate, not a payoff**. The code has the
payoff. `estate-resolution.ts:152-153` calls `closeOutDerivativesOfParty` at the moment the estate
is opened, and that function `pay()`s the replacement value straight out of the defaulted party's
account. The estate's claim list is built afterwards (`:520 addClaim`) and carries exactly five
instrument types — `LEVERAGED_LOAN`, `CORP_BOND`, `COMMERCIAL_PAPER`, `EQUITY`, `BANK_FACILITY`.
**A derivative close-out is not one of them.**

So a surviving counterparty is settled at 100 cents out of the estate's cash before the waterfall
runs, while the secured lender behind it recovers whatever is left — an accidental super-seniority
created by call order, not by any stated rule. On the other side, a close-out the estate *owes*
drives the dead account further negative with no claim recorded against it, which is where E3's
"the loss lands on named survivors" quietly stops being true.

Adjacent to **§3 step 33** (seniority is decorative) but not the same defect: 33 is about ordering
*within* the claim list, and this is a claimant that never reaches the list. **Becomes a §3 step**
— small (one `addClaim` at the right seniority instead of a `pay`), and it changes recovery for
every defaulted issuer that had a swap or wrote protection.

### ❌ A4 / D2.b — THE ZERO-SUM IS NEVER MEASURED, AND HALF THE BOOK HAS NO MARK

Two VERIFY nodes, one absence. The audit reads `state.derivativesBook` twice —
`audit/ownership.ts:260` (O8, keys resolve) and `:292` (O5, both parties alive) — and neither
sums a mark. Σ marks = 0 does hold by construction wherever a mark exists, because
`settleDerivativeClass`'s `settleMark` pays one delta between the contract's own two parties; it
is unverified, and for `IRS` and `CDS` it is vacuous, since both profiles set
`markToMarketUSDToA: () => null`. A swap has no value between its weekly nets, so the largest
class in the book contributes nothing to the invariant that defines the layer.

The missing marks are **Already §3 step 17**. The missing measurement is
**a measurement, for §3 step 38**: A4 and D2.b are the layer's own audit family and nothing
produces either number.

### ⚠️ D1 / D5 / F2 — MARGIN IS A STATED RATE, SO IT CANNOT RISE WHEN IT MATTERS

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

`payToB` journals the variation-margin leg unconditionally; there is no cash test and no failure
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

**Becomes a §3 step.** It is the missing half of step 17's margin work and should be built with
it: risk-based margin with no failure path is a bigger number that still cannot fail.

### ⚠️ C1 / C1.a — BILATERAL WITHOUT AN AGREEMENT, GROSS WITHOUT A NETTING SET

The layer is bilateral, but only in the weak sense that each row names two parties. There is no
CSA, no netting set, and no per-pair exposure anywhere: `settleDerivativeClass` pays **every
contract's leg separately**, gross, so two parties with ten offsetting contracts send ten wires.
C1.a's point — that gross notional and net exposure are orders of magnitude apart — has no number
in this model at all, because net exposure per pair is never computed.

This is the mirror of F3 being clean, and both close with step 17: a netting set is what a CCP
membership is. Recorded here so that when 17 lands, the bilateral case is not left as the
untouched half. **Already §3 step 17.**

### ✅ F3 — NO NETTING ACROSS COUNTERPARTIES, AND THIS ONE IS HONESTLY CLEAN

The tree's sharpest FORBID, and the code obeys it. `registry.ts:standingPfeChargeUSD` and
`standing-book.ts`'s `add` charge a party for **every live contract it stands on, on either
side**, at the class's add-on, with no offsetting whatever — `if (bKey !== aKey)` charges both
parties, and a long and a short in the same name against different counterparties consume the desk
budget twice. `deskNotionalCapacityUSD` then spends that gross charge. Nothing nets an exposure to
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
novation, the one that is a real change of who faces whom by choice, has no code. **Becomes a §3
step**, small, and naturally part of 17's clearing-member work.

### ❌ E4 — THE LOSS CHAIN IS NOT TRACEABLE

Nothing records who lost what when a party fails with open positions. `closeOutDerivativesOfParty`
returns a count of contracts closed and nothing else; the cash legs are indistinguishable in the
journal from any other `derivative close-out` reason. **A measurement, for §3 step 38** — the node
is a VERIFY, and what it wants is a read of the loss chain, not a new mechanism.

### ⚠️ D3 — THE MARGIN COMES BACK, BUT NOBODY OWNS IT IN THE MEANTIME

`releaseInitialMargin` returns the posted cash when the contract ends, which is the half that was
missing before and now works. What is still absent is the poster's *claim*: the cash leaves the
holder's balance (`fx-forward.ts:362`) and is carried only as the desk's liability
(`FxDealerBook.initialMarginHeldUSD`, written to the sheet as `clientMarginUSD`). The poster's own
books show the money simply gone. "Held, not consumed" is true of the desk's side and not of the
poster's. Closes with step 17's margin rebuild.
