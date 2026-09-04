# SYSTEM: SHORT-TERM DEBT

Paper issued for months, not years: treasury bills, commercial paper, certificates of deposit.
Different from the money market (`money-market.md`, which is secured and unsecured *lending*
between banks) because this is a **security** — issued, registered, traded and held by anyone.
Different from `corporate-credit.md` only in tenor, and the tenor changes everything about why it
exists.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. THE INSTRUMENT
- **A1** REASON — it satisfies the bond contract (`../instruments/bond.md`), answering these nodes
  its own way:
  - A1.a **N5 coupon** — usually none: it is issued at a **discount** and redeems at par, and the
    discount is the whole return
  - A1.b **N4 maturity** — under a year, typically weeks to months
  - A1.c **N13.a seniority** — senior unsecured, ranking with the issuer's other senior debt
  - A1.d **N11 early termination** — none. It is too short to be worth an option
- **A2** REASON — its **price** is what it clears at, and the yield is derived from price and days
  to maturity (rule 3)
  - A2.a on a stated day-count and quoting convention, because at this tenor the convention is a
    material part of the number (rule 8)
- **A3** REASON — there are **types by issuer**: the state (bills), a bank (CD), a firm (CP), and
  the type is the credit

### B. WHY AN ISSUER ISSUES IT
- **B1** REASON — to fund a **short, known need**: a tax date, a seasonal working-capital swing,
  a bridge to a term issue
- **B2** REASON — because it is **cheap** when the curve is upward-sloping
- **B3** REASON — **and it must be rolled.** That is the price of B2, and it is the whole risk
  - B3.a a rollover is a **new issue into a market that must clear**
    (`the-clearing-engine.md` C4): the issuer is asking the market to lend again, and it may not
  - B3.b so a run is possible: buyers decline, the issuer must repay maturing paper out of cash
    it does not have, and it must find the money somewhere (`banks-funding-and-liquidity.md` E)
- **B4** REASON — the issuer therefore keeps a **backstop** — a committed bank line, a liquid
  buffer — and the backstop costs money in every week it is not used
- **B5** VERIFY — the **maturity profile** of outstanding paper is a read, and a concentrated
  profile is a foreseeable wall

### C. WHY A BUYER BUYS IT
- **C1** REASON — a **cash investor with a horizon**: a money fund, a corporate treasurer, a bank
  liquidity book (`fund-shares.md` D, `insurers-and-pensions.md`)
- **C2** REASON — the reasons are **yield against the alternatives** — a deposit, a repo, the
  central bank's facility — and **credit** and **liquidity**
  - C2.a which makes short-term debt a real substitute for a deposit, and therefore one of the
    channels a policy rate travels down (`households.md` D5.a)
- **C3** REASON — a buyer has a **limit per issuer**, and the limit is why a deteriorating issuer
  loses funding before it loses solvency
- **C4** VERIFY — when the policy rate moves, the bill yield should move with it, because the
  buyers' alternative moved — not because a rule ties them

### D. TRADING AND PRICING
- **D1** REASON — it **trades** after issue, at a cleared price, so a holder can get out early
- **D2** REASON — its price responds to **the level of short rates and the issuer's credit**, and
  at this tenor the first dominates until the second is in doubt, at which point it inverts
- **D3** REASON — it is **collateral** (`money-market.md`, `securities-lending.md`), with a
  haircut, which is a large part of why anyone holds it
- **D4** VERIFY — a spread over the equivalent-tenor bill is a **derived read** of two cleared
  prices, never a stored number

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no automatic roll.** Paper that always rolls at a written rate is not debt; it
  is a permanent liability with a coupon, and it removes the only risk the instrument has
- **E2** FORBID — **no price without a market.** A discount computed from a curve nobody traded is
  rule 3's defect at the short end
- **E3** FORBID — **no negative outstanding**, and no maturity that passes without cash moving

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent (or, on a FORBID node, the
forbidden thing is there). Every citation is checked by `scripts/check-atlas.sh`.

Two instruments answer this tree and they answer it differently, so a row that splits says which:
**bills** (`07f`'s `b13`/`b26`/`b52` buckets of the sovereign ladder) and **commercial paper**
(`07f`'s CP book). A third — the bank CD — does not exist at all.

| Node | Code | |
|---|---|---|
| A1 it satisfies the bond contract | `src/domain/company.ts:isCommercialPaper` | ⚠️ |
| A1.a coupon: none — issued at a **discount**, redeems at par | `src/domain/government.ts:discountBillProceedsLocal` | ⚠️ |
| A1.b maturity under a year | `src/engine/simulation/stages/shared-helpers.ts:SOV_BILL_MAX_TENOR_YEARS` | ✅ |
| A1.c senior unsecured, ranking with other senior debt | `src/domain/estate.ts:CLAIM_SENIORITY` | ✅ |
| A1.d optionality: none — too short to be worth an option | `src/domain/call-protection.ts:callProtectionForIssue` | ✅ |
| **A2 its PRICE is what it clears at; the yield is derived** | `src/engine/simulation/stages/07f-short-debt-clearing.ts:cpInstruments` | ✅ |
| A2.a on a stated day-count and quoting convention | — | ❌ |
| A3 types by issuer: state (bills), bank (CD), firm (CP) | `src/engine/simulation/stages/07f-short-debt-clearing.ts:CP_BOOK` | ⚠️ |
| B1 to fund a short, known need | `src/engine/simulation/stages/07f-short-debt-clearing.ts:WORKING_CAPITAL_SHARE_OF_REVENUE` | ✅ |
| B2 because it is cheap when the curve is upward-sloping | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:billShareTarget` | ⚠️ |
| B3 **and it must be rolled** | `src/engine/simulation/stages/07f-short-debt-clearing.ts:rollNeedLocal` | ✅ |
| B3.a a rollover is a new issue into a market that must clear | `src/engine/simulation/stages/07f-short-debt-clearing.ts:cpParticipants` | ✅ |
| B3.b so a run is possible | `src/engine/simulation/stages/07f-short-debt-clearing.ts:revolverLocal` | ✅ |
| B4 the issuer keeps a **backstop**, and it costs money unused | `src/engine/simulation/stages/corporate-financing.ts:committedLineHeadroomLocal` | ⚠️ |
| B5 VERIFY the maturity profile is a read | `src/domain/company-week/credit-standing.ts:maturityWallShare` | ✅ |
| C1 a cash investor with a horizon | `src/engine/simulation/stages/07f-short-debt-clearing.ts:CASH_SLEEVE_BILL_SHARE` | ⚠️ |
| C2 yield against the alternatives, credit, and liquidity | `src/domain/commercial-paper.ts:cpReservationYieldBps` | ✅ |
| C2.a a real substitute for a deposit — a policy-rate channel | `src/engine/simulation/stages/07f-short-debt-clearing.ts:BANK_BILL_PICKUP_BPS` | ⚠️ |
| C3 a buyer has a limit per issuer | `src/domain/commercial-paper.ts:CP_SINGLE_ISSUER_LIMIT` | ✅ |
| C4 VERIFY the bill yield moves with the policy rate | `src/engine/simulation/stages/07f-short-debt-clearing.ts:runShortDebtClearingStage` | ⚠️ |
| D1 it trades after issue, at a cleared price | `src/engine/simulation/stages/07f-short-debt-clearing.ts:cpClearedPriceById` | ✅ |
| D2 its price responds to short rates and to the issuer's credit | `src/domain/commercial-paper.ts:cpReservationYieldBps` | ✅ |
| D3 it is **collateral**, with a haircut | `src/engine/simulation/stages/repo-clearing.ts:computeSovereignRepoHaircuts` | ⚠️ |
| D4 VERIFY a spread over the equivalent-tenor bill is a derived read | `src/engine/credit-price.ts:rowSpreadBps` | ✅ |
| E1 FORBID **no automatic roll** | `src/engine/simulation/stages/07f-short-debt-clearing.ts:cpIssuers` | ✅ |
| **E2 FORBID no price without a market** | `src/engine/simulation/stages/bill-accretion.ts:weeklyAccretionRate` | ❌ |
| E3 FORBID no negative outstanding, no maturity without cash | `src/engine/simulation/stages/07f-short-debt-clearing.ts:maturedLocal` | ✅ |

---

## 3. THE DIFF

**27 nodes: 16 ✅, 9 ⚠️, 2 ❌.** The best-mapped of the four credit trees, and for a reason worth
recording: **`07f` is the youngest book and the only one written after rule 3 was stated**, so its
issuer side, its buyer side and its failure path are all real. What it inherited from the rest of
the model was the one defect the credit rows have now removed — the thing that cleared was a yield.

### ✅ A2 / D1 / D2 / D4 — CLOSED: BOTH HALVES OF THE SHORT END CLEAR A PRICE

**Was KNOWN(13).** `07f`'s two books both opened `statKind: 'YIELD_LIKE'`, so a bill and a piece of
CP changed hands in the secondary at a dollar of face like everything else, and A2's "the yield is
derived from price and days to maturity" was exactly inverted.

§9.13-SOV row 4 closed the BILL half and §9.13-CREDIT row 4 the CP half, in the same shape: the
buyer's reservation stays a YIELD — which is genuinely what a cash investor has, since its
alternative is the paper its money would otherwise sit in — and is stated as the PRICE that yield
implies on the paper's own remaining life (`pricing/bond.ts:priceFromYield`). CP now prices one
instrument per piece of paper rather than one per issuer, so a roll with four weeks left and a
fresh thirteen-week issue are two prices, and D4's spread is read back off the cleared price at the
paper's own tenor (`credit-price.ts:rowSpreadBps`) rather than being the thing that was cleared.

The half `07f` always got right and which is now the general case: `priceFractionById` computes a
real primary price and rebates both legs of the primary instruction, so the buyer books at cost and
the treasury receives the discount. The comment beside it records what it fixed (*"every primary
placement minted its own discount into the holders' books while the treasury was overpaid by the
same amount"*).

### ❌ A2.a / E2 — NO STATED CONVENTION, AND THE BILL'S RETURN IS STILL RE-SET WEEKLY

**E2's FORBID is the sharp finding and it is NEW.** `bill-accretion.ts:26-35` accretes a held bill
at *this week's* curve, not at the yield it was bought at:

```
const annual = bucket.years <= 0.3 ? reg.zeroRates.tenor3M
             : reg.zeroRates.tenor3M + (reg.zeroRates.tenor2Y - reg.zeroRates.tenor3M) * (bucket.years / 2);
```

and `reg.zeroRates.tenor3M` is written at `07c:523` by `calculateNelsonSiegelZeroRate(0.25,
fittedParams)` — **an interpolated point on a fitted curve**, which 07f then refits again (step 25's
two owners). So the holder's return on a discount bill is "a discount computed from a curve nobody
traded", which is E2's own words. It also breaks the conservation `bill-accretion.ts`'s header
claims for itself: the treasury receives `face/(1+y₀·t)` at issue and repays `face` at redemption,
while the holders accumulate accretion at `yₜ`, and the two only agree if `y₀ = yₜ`. Nothing
measures the gap. **Becomes a §3 step** (shared with `sovereign-credit.md` F2, where the same finding
is recorded from the instrument's side) — small, and it folds into 13-SOV, which has to store the
bill's issue price anyway.

**Row 4 did not touch E2**, and the plan's row-4 line claiming it would was wrong: the accretion is
a BILL mechanism on the sovereign side, not the CP book. §9.13-EQUITY got it half way — `07f` now
DEPOSITS each cleared bill price in the price store, so the number E2 wants exists — and then found
the other half is a rule-4 problem rather than only a rule-3 one: `register-marking` would set a
bill's value from that print while `bill-accretion` sets the same value from a fit, two writers of
one number with the income booked against whichever wrote last. Bills are excluded from the mark
until one owner is decided, which is §3's **13-BILL**: the mark sets the value and the income IS
its delta, so the accretion stops being computed and starts being observed.

A2.a has no code at all: nothing in `07f`, `government.ts` or `commercial-paper.ts` names a
day-count or a quoting convention. `discountBillProceedsUSD` is `face/(1 + y·t)` — simple money-market
discount, which is a convention, but it is a convention nothing declares and no other consumer
shares. Rule 9 wants it at the type. **Becomes part of §3 step 28b** (the units sweep), which is
where every unstated convention belongs.

### ⚠️ A3 — THERE IS NO CERTIFICATE OF DEPOSIT

`grep -rn "CERTIFICATE_OF_DEPOSIT\|'CD'" src` returns nothing. Two of A3's three issuer types exist
and the bank's does not: a bank funds itself with deposits, repo, the central-bank window and
wholesale funding, none of which is a SECURITY somebody else can hold, price and sell.

This is **MISSING rather than OUT OF SCOPE**, and the reason is C1. The buyer side of this tree is
money funds and corporate treasurers, and in reality a large part of what they hold is bank paper —
so the model's cash investors face a choice between bills and CP where a real one faces bills, CP
and CDs, and the bank is absent from the market that prices its own short funding. **Becomes a §3
step**, medium: the instrument is a `DebtTranche` with a bank issuer and the book already exists
(it clears beside CP in `07f`), but it has to be reconciled with the wholesale-funding roll that
represents the same money today — which is `banks-funding-and-liquidity.md`'s territory and the G2
unification the code keeps deferring to.

### ⚠️ A1 / A1.a — CP IS NOT A DISCOUNT INSTRUMENT HERE

`07f:944-952` issues placed paper as
`{ rateType: 'FIXED', couponRate: clearedBps/10000, isCommercialPaper: true }` at **par**, so the
issuer receives the full face and repays face plus a coupon at maturity. The bill side is correct
(a real discount, above); the CP side is interest-bearing paper wearing the CP flag. Economically
the two are close and the difference is not nothing: it puts CP's cost in the coupon line rather
than in the redemption leg, which is the exact confusion `government.ts:70-84` warns about for
bills and solved there.

A1 is ⚠️ for the structural half of the same point: CP is `DebtTranche` **plus a boolean**
(`isCommercialPaper`), and the field's own doc-comment lists four separate consumers that must
remember to skip it (`07b`'s float, stage 08's refinancing and prepayment, `07d`'s loan float).
That is the `isBankFacility` shape beside it and the `isDiscountBill` shape in the sovereign ladder
— three flags on two types doing the work of five instruments. **Already §3 step 30c** (the security
as a discriminated union), and this tree is its clearest single case.

### ⚠️ B4 — THE BACKSTOP IS FREE

`committedLineHeadroomUSD` sizes a real committed line off what the borrower's earnings can service,
and `07f:960-976` draws it at policy + 300bp when a roll fails, which is the mechanism B3.b needs
and it works. What is missing is the other half of B4: **a committed line costs money in every week
it is not drawn**, and `grep -rn "commitmentFee\|undrawn" src` finds no corporate commitment fee
anywhere. So every CP issuer carries free insurance against its own rollover risk, which makes CP
strictly cheaper than term debt with no offsetting cost — the funding-mix decision B2 asks for is
being made against an incomplete price. **Becomes a §3 step**, small: it is one weekly payment from
the borrower to the named house bank on the undrawn headroom the model already computes.

### ⚠️ C1 / C2.a — THE BUYER BASE IS RIGHT AND ITS CONSTANT IS NOT

C2 is ✅ and it is the strongest node here: `cpReservationYieldBps` is the cleared bill plus the
issuer's short-horizon expected loss, `cpCreditPolicyShare` makes credit policy a SIZE rather than
a gate (which is what makes a partial roll expressible), and `CP_SINGLE_ISSUER_LIMIT` is C3 exactly.
C1 is ⚠️ only because *how much* cash an investor brings is `CASH_SLEEVE_BILL_SHARE = 0.5` of a
sleeve that is itself `CASH_SLEEVE_OVERNIGHT_SHARE = 0.5` — **already §3 step 30b**, which names that
constant as the largest stated shape still moving cash.

C2.a is ⚠️ for the half that is missing rather than the half that is wrong. Banks genuinely arbitrage
reserves against bills (`BANK_BILL_PICKUP_BPS`, and it is why bills trade on the corridor), and
corporate treasurers genuinely bid (`treasuryParticipantId`). **Households cannot hold a bill at
all**, so the channel this node exists for — a policy rate reaching a saver who is not a bank's
customer — runs only through the money fund. Same finding as `sovereign-credit.md` E2.f.

### ⚠️ D1 / D2 / D3 / D4 — THE SECONDARY MARKET IS THINNER THAN THE PRIMARY

D1: the secondary float trades, and it trades in stored-value units at face (`07f:365` says so in
terms) — the discount exists at issue and nowhere after. D3: bills are repo collateral with a
derived haircut (`computeSovereignRepoHaircuts`), and **CP is not repo collateral at all** —
`prime-brokerage.ts:60` returns haircuts for EQUITY, CORP_BOND, LEVERAGED_LOAN and GOV_BOND, so CP
falls to `DEFAULT`, the max of the three. D4: the audit's CP spread is
`(cp.couponRate − policyRate) × 1e4` (`prices.ts:30`) — a spread over the POLICY RATE, where the node
asks for a spread over the equivalent-tenor bill, which is the thing the same stage clears fifty
lines earlier. All four close with step 13 and the last one is a two-line audit fix.

### ⚠️ C4 — A VERIFY NODE WITH A GOOD MECHANISM AND NO MEASUREMENT

`BANK_BILL_PICKUP_BPS` is exactly the reason C4 wants — a bank's reservation is the policy rate plus
a few basis points because a bill is the closest substitute for a reserve balance, so the bill
yield tracks the corridor *because the alternative moved*, not because a rule ties them. Nothing
measures whether it actually does. **A measurement, for §3 step 38.**

### PRESENT AND NOT WORTH RE-CHECKING

**B3, B3.a, B3.b and E1 are the branch this tree exists for and they are all ✅.** A roll is a real
new issue into a book that must clear; what it cannot place is funding the issuer does not get; a
maturity it cannot fund draws the revolver at a real penalty from a named bank, with a real payment
and a real news item. E1's FORBID — no automatic roll at a written rate — is satisfied by
construction, because the roll goes through the auction and the auction can say no. E3 is ✅ too:
`07f:645-651` reads matured face off the ladder rows and every leg settles through `pay`.
`domain/commercial-paper.ts`'s header is worth reading as the model of how a formula price gets
retired: it names the three things the formula made impossible, and all three now work.

**One cross-reference slip in the required tree, since corrected.** A1.c was labelled "N11
seniority" and A1.d "N13 optionality", where `../instruments/bond.md` has N11 as the
early-termination regime and N13.a as the ranking — the two numbers were swapped against their own
labels. The labels have been repointed (A1.c → N13.a, A1.d → N11).

This is the one edit to a §1 that the atlas's rules permit, and it is worth being explicit about
why. The rule is that **a node is never deleted or weakened to make the tree green** — the required
side must not be edited to fit what the mapping found. Fixing a citation that pointed at the wrong
number in a sibling file changes nothing about what either node REQUIRES: both were mapped by their
words, which were never ambiguous, and both keep the same mark. A wrong cross-reference left in
place would send the next reader to the wrong contract node, which is the failure mode this whole
atlas exists to prevent.
