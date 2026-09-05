# SYSTEM: INSURERS AND PENSIONS

The long-horizon asset owners. They matter to this world for one structural reason: **their
liabilities are long, contractual and not tradable**, which makes them the natural buyer of
duration and the natural seller of liquidity — the mirror image of a bank
(`banks-funding-and-liquidity.md`).

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT THEY ARE
- **A1** REASON — **named parties with accounts and registers**, holding assets against
  liabilities they owe to named beneficiaries (`households.md` F3)
- **A2** REASON — **a real liability**: a promise to pay stated amounts at stated future times
  - A2.a it is a **liability of the institution**, not a fund share — the beneficiary does not
    absorb the investment result (`fund-shares.md` A3 is the contrast, and it is the whole
    difference)
  - A2.b except where the contract says otherwise, in which case it IS a fund share and must be
    modelled as one
- **A3** REASON — **equity is assets − liabilities**, a read, and it can go negative — which is a
  solvency event with consequences
- **A4** REASON — they receive **premiums or contributions** and pay **claims or pensions**, and
  - A4.a an insurer carries a **book** of cover and **quotes a price** for it that answers its
    own losses and its own capital; a policy goes to the insurer that prices lower
  both are real flows to and from named parties

### B. THE LIABILITY SIDE
- **B1** REASON — the liability has a **schedule**: how much is owed in each future period
- **B2** REASON — its **present value depends on a discount rate**, and the rate is read from a
  market (`interest-rate-swaps.md` C, `sovereign-credit.md`)
  - B2.a so **falling rates raise the liability**, which is why a rate move is a solvency event
    for this sector and a P&L event for everybody else
  - B2.b FORBID — **no fixed discount rate.** A liability discounted at a constant is a liability
    that never moves, and the sector's defining risk disappears
- **B3** REASON — the schedule is **uncertain**: mortality, longevity, claim frequency
- **B4** REASON — an insurer's claims can be **correlated and lumpy** — a catastrophe is one event
  hitting many policies at once, which is different from the average being higher

### C. THE ASSET SIDE
- **C1** REASON — it invests the premiums, and the **portfolio is a decision** with reasons
  (`households.md` D5)
- **C2** REASON — the **dominant reason is matching B1**: long assets against long liabilities
  - C2.a so it is a **structural buyer of long bonds and long swaps**
    (`interest-rate-swaps.md` B2.a) — a one-way demand that exists whatever the price, which is a
    real force in that market and not a preference
- **C3** REASON — it can hold **illiquid assets**, because it does not face redemption the way a
  fund does — that is what it is paid for
- **C4** REASON — it **lends securities** for extra return (`securities-lending.md` B2)
- **C5** REASON — it is a **buyer of credit** (`corporate-credit.md`), and its mandate limits which
  credits — so a downgrade can force a sale

### D. THE GAP AND WHAT IT FORCES
- **D1** REASON — assets and liabilities **do not match**, and the mismatch is measurable in
  duration and in cash flow
- **D2** REASON — the mismatch **moves equity when rates move**, in the opposite direction to a
  bank's
- **D3** REASON — a **funding shortfall** has consequences: the sponsor contributes, the fund
  de-risks, or benefits are cut — each a real action by a named party
- **D4** REASON — it can **hedge** the gap, and hedging it costs money and creates margin calls
  (`the-derivative-layer.md` D2)
  - D4.a a leveraged hedge turns a solvency improvement into a **liquidity requirement**, which is
    the failure mode of the whole sector
- **D5** VERIFY — a large rate move should show as: liability revaluing, hedge revaluing the other
  way, and cash moving on the hedge but not on the liability. That asymmetry is the finding

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no liability without beneficiaries.** Somebody named is owed the money
- **E2** FORBID — **no asset that is not somebody's liability or a real thing**
  (`the-register.md` A2)
- **E3** FORBID — **no solvency measured against a stored liability value.** It is a read from B1
  and B2, every time
- **E4** VERIFY — the sector's holdings, added to every other holder's, equal what was issued
  (`the-register.md` B2) — this sector is large enough that its absence would show up there

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 named parties with accounts and registers | `src/domain/institutions.ts:InstitutionalEntity` | ✅ |
| A2 a real liability: stated amounts at stated future times | `src/domain/institutions.ts:beneficiaryLiabilityLocal` | ⚠️ |
| **A2.a a liability of the institution, not a fund share** | `src/engine/simulation/stages/household-balance-sheet.ts:institutionalClaims` | ❌ |
| A2.b except where the contract says it IS a fund share | `src/domain/institution-profiles.ts:beneficiariesAreHouseholds` | ⚠️ |
| A3 equity = assets − liabilities, and it can go negative | `src/engine/simulation/stages/household-balance-sheet.ts:equityCapitalLocal` | ⚠️ |
| A4 premiums/contributions in, claims/pensions out | `src/engine/simulation/stages/insurance-and-pensions.ts:runInsuranceAndPensionsStage` | ✅ |
| A4.a an insurer has a book and a PRICE, and the price is its own | `src/domain/institutions.ts:placeInsuranceRenewals` | ✅ |
| **B1 the liability has a schedule** | — | ❌ |
| **B2 its present value depends on a market discount rate** | — | ❌ |
| B2.a falling rates raise the liability | — | ❌ |
| **B2.b FORBID no fixed discount rate** | `src/engine/simulation/stages/insurance-and-pensions.ts:beneficiaryLiabilityLocal` | ❌ |
| B3 the schedule is uncertain | `src/engine/bootstrap/population.ts:remainingLifeExpectancyYears` | ⚠️ |
| B4 claims are correlated and lumpy | — | ❌ |
| C1 the portfolio is a decision with reasons | `src/domain/institution-profiles.ts:targets` | ✅ |
| C2 the dominant reason is matching B1 | `src/domain/institution-profiles.ts:liabilityDriven` | ⚠️ |
| C2.a a structural buyer of long bonds and long swaps | `src/domain/institution-profiles.ts:sovereignCoreShare` | ✅ |
| C3 it can hold illiquid assets | — | ❌ |
| C4 it lends securities | `src/engine/simulation/stages/securities-lending.ts:runSecuritiesLendingStage` | ✅ |
| C5 a buyer of credit whose mandate limits which credits | `src/domain/institution-profiles.ts:subInvestmentGradeSizeFactor` | ⚠️ |
| D1 the mismatch is measurable in duration and cash flow | `src/engine/simulation/stages/derivative-markets/irs.ts:durationGapLocal` | ⚠️ |
| D2 the mismatch moves equity when rates move | — | ❌ |
| D3 a funding shortfall has consequences | `src/domain/institution-profiles.ts:pensionHurdle` | ⚠️ |
| D4 it can hedge, and hedging costs money | `src/engine/simulation/stages/derivative-markets/irs.ts:runSwapMarket` | ⚠️ |
| **D4.a a leveraged hedge turns solvency into liquidity** | `src/domain/derivatives/classes/irs.ts:closeOutMoveOf` | ❌ |
| D5 VERIFY the asymmetry on a large rate move | — | ❌ |
| E1 FORBID no liability without beneficiaries | `src/engine/simulation/stages/household-balance-sheet.ts:institutionalClaimsLocal` | ✅ |
| E2 FORBID no asset that is not somebody's liability or a real thing | `src/domain/institutions.ts:institutionTotalAssetsLocal` | ✅ |
| **E3 FORBID no solvency against a stored liability value** | `src/domain/institutions.ts:beneficiaryLiabilityLocal` | ❌ |
| E4 VERIFY holdings + every other holder = issued | `src/engine/audit/ownership.ts:auditOwnership` | ✅ |

---

## 3. THE DIFF

**2026-09-05 (§9.13f) — E2's read counts the receivable.** `institutionTotalAssetsLocal` takes the
coupon accrued on the entity's register rows and not yet paid by a date (`holdings.ts:accruedLocal`,
read by `bookAccruedLocal`) as an asset, the same line a bank carries as `sovereignAccruedCouponLocal`
and off the same ledger; the statement view shows it as "Accrued coupon". Before, an institution
that paid a seller's accrued at settlement had the cash gone and nothing standing against it until
the coupon date.

### ✅ A4.a — A POLICY GOES TO THE INSURER THAT PRICES LOWER

2026-09-05 (§9.16b-i, ii). Each insurer carries a book — the cover it stands behind, in the unit a
policy is written on (`institutions.ts:InsuranceBook`) — and quotes a rate for it off its OWN
trailing loss experience and its OWN capital's hurdle (`quoteInsuranceRate`: the claims a unit of
cover brings plus the return on the surplus held against the premium). Premiums are each
insurer's book at its rate and claims are each insurer's own; the pool split pro rata by capital,
with pooled claims, is gone. And the market between them exists: each week a year's policies
renew one week at a time and, with the growth of what there is to insure, go to the lowest quote
with the capacity to write them — the cover its surplus stands behind at its own rate
(`placeInsuranceRenewals`); an insurer with no surplus writes nothing and loses its renewals, so it
loses book before it loses its licence; cover nobody can write is unplaced
(`region-macro.ts:insuranceUnplacedCoverLocal`). §3.16b-iii is the VERIFY: the harness measures
the shares moving.

### ❌ B1 / B2 / B2.a / B2.b / E3 — THE LIABILITY IS A CASH BALANCE, NOT A PRESENT VALUE

There is no discount rate in this sector, fixed or otherwise, because **there is no discounting.**
The whole liability is one number, `beneficiaryLiabilityLocal`, and
`insurance-and-pensions.ts:206-208` is its entire law of motion:

    e.beneficiaryLiabilityLocal = Math.max(0, (e.beneficiaryLiabilityLocal ?? 0)
      + (weeklyContributionsLocal - weeklyBenefitsLocal) * share);

plus, at `household-balance-sheet.ts:70`, `+ max(0, lastWeeklyInvestmentIncomeLocal)`. Contributions
in, benefits out, investment income credited. **No schedule (B1), so no cash flows to discount; no
rate (B2), so no present value; and therefore no repricing when rates move (B2.a).**

B2.b forbids a *fixed* discount rate because a liability discounted at a constant never moves.
The code reaches that forbidden outcome by a shorter road: with no rate at all, the liability's
sensitivity to rates is exactly zero, and **the sector's defining risk is not modelled.** A
hundred-basis-point rally revalues an insurer's assets and leaves its obligations untouched, which
makes an insurer a leveraged bond fund rather than an insurer. E3 falls with it — solvency
(`equityCapitalLocal = totalAssets − liabilityLocal`) is measured against exactly the stored value the
node forbids, and D2 and D5 have nothing to be true of.

The pieces for a schedule exist. `bootstrap/population.ts:remainingLifeExpectancyYears` already
gives the drawdown horizon (the stage uses it, at `:196`, to size this week's benefit), the DEM
cohorts carry ages, and every region publishes a cleared curve. What is missing is that the
entitlement is carried as a stock instead of as dated amounts.

**§3 step 37-PENSION** — it is the sector's reason to
exist. Nothing in §3 names it: step 16b is about insurance *pricing* between three insurers,
31b about the claims loss ratio, neither about the liability's valuation.

### ❌ A2.a / A2.b — THE BENEFICIARY ABSORBS THE INVESTMENT RESULT, WHICH MAKES IT A FUND SHARE

A2.a is the node that separates this system from `fund-shares.md`, and the code is on the wrong
side of it. `institution-profiles.ts:29` marks INSURER, ASSET_MANAGER, PENSION_FUND and HEDGE_FUND
alike as `beneficiariesAreHouseholds`, and `household-balance-sheet.ts:63-70` states the intent in
its own comment: *"THE BENEFICIARIES OWN WHAT THEIR MONEY EARNS, for every kind that has them —
not only pensions."* The claim grows by `lastWeeklyInvestmentIncomeLocal` and the household sheet
marks it at that value.

That is the definition of a fund share: the holder takes the investment result. A pension
entitlement and a policy reserve are the opposite — the institution owes a stated amount and
**keeps the surplus or eats the deficit**, which is what makes it the natural buyer of duration
and what makes a rate move a solvency event for it and a P&L event for everybody else. Here the
result is passed straight through, so there is no surplus to defend and no deficit to fund.

A2.b says a contract that genuinely works that way IS a fund share and must be modelled as one.
The code has taken that branch for **every** kind, without a contract saying so. Same step as B1;
they are one change, because a liability the institution really owes is precisely a schedule it
owes whatever its assets did.

### ❌ D4.a — THE HEDGE EXISTS AND POSTS NO MARGIN, SO IT CANNOT PRODUCE THE FAILURE MODE

The hedge itself is well built. `derivative-markets/irs.ts:71` selects `liabilityDriven` entities
as the receive-fixed side of the swap book, prices their reservation at the government bond of the
same tenor (`reservationStat: zeroBps`, `:169`), and sizes each one off its own book. That is C2/D4
done properly.

But an IRS carried no initial margin (until §9.17-ii sized it from the tenor's own rate move —
`irs.ts:closeOutMoveOf` — a swap posted none), and there is no variation margin on an IRS anywhere — `grep variationMargin` over `src/` returns nothing; the only margin
calls in the model are `securities-lending.ts:159` on a stock loan. So the swap costs nothing to
carry and demands nothing when it moves. **The one thing D4.a describes — rates fall, the hedge
gains, the liability gains more, and the fund has to find cash for a position that is winning —
cannot happen**, and neither can its mirror, which is the sector's actual failure mode.

**Already §3 step 17** (17-i and 17-ii done: the margin is a fact of the contract, sized from the
reference's own move at strike; 17-iii gives the swap a mark and variation margin, 17-iv a CCP). This tree is the demand-side
reason that step matters.

### ⚠️ D1 — THE "DURATION GAP" IS MEASURED AGAINST ASSETS, BECAUSE THERE IS NO LIABILITY TO MEASURE AGAINST

`irs.ts:158` computes it as
`durationGapLocal = institutionTotalAssetsLocal(…) − bondBookLocal − alreadyReceivingLocal`: everything the
entity owns that is not already a rate-duration asset. The comment above it says *"a
liability-matched book's assets are shorter than its claims, and the gap is what it will take
synthetically"* — but no claim enters the arithmetic. The number is real and it is not D1's number,
which is duration of assets against duration of liabilities. It becomes D1's number when B1 exists;
no separate step.

### ⚠️ A3 / D3 — SOLVENCY IS A READ WITH NO CONSEQUENCE

`equityCapitalLocal` is genuinely `institutionTotalAssetsLocal − liabilityLocal` and can go negative
(`household-balance-sheet.ts:74`). Nothing reads the sign. `isDefaulted` is set for institutional
entities nowhere in `src/` — only `bank-resolution.ts:224` sets it, and only on banks — so an
insolvent insurer or pension fund keeps writing business, keeps bidding in every auction, and its
beneficiaries' claims are still marked at full value on the household sheet.

D3's three real responses (the sponsor contributes, the fund de-risks, benefits are cut) are all
absent. The nearest thing is `institution-profiles.ts:pensionHurdle`, which divides the benefit
need by `fundedRatio` — an underfunded fund *raises* its required return, so it reaches for risk.
That is one of the three real behaviours, and it is the one that is not a consequence anybody
chose. **§3 step 37-IMMORTAL**, smaller than B1's and dependent on it: a solvency event needs a
liability worth being insolvent against.

### ❌ B4 / C3 — TWO ABSENCES THE STAGE'S OWN HEADER ALREADY ADMITS

**B4** — `insurance-and-pensions.ts:26-30` states it: *"claims are allocated in proportion to
premiums, which is right in aggregate and wrong in the way that matters most — real claims are
LUMPY … this stage moves real money on a real schedule but does not yet transfer real risk."* The
code is `claimLocal = premiumLocal * claimRecoveryRate` at `:127`, with the same ratio for every firm
and household in the region. A catastrophe — one event hitting many policies at once — has no
representation, which is the whole economic content of insurance. The hooks the header names
(estates, `macro/weather.ts`'s anomalies with their real per-region exposure) already exist.
**§3 step 37-SMALL**, adjacent to 16b but not the same one: 16b is about the price of a policy,
this is about the loss it covers.

**C3** — no illiquid sleeve. `INSTITUTION_PROFILES` gives an insurer
`{ govBondPct, corpBondPct, loanPct, equityPct, cashPct }` and nothing else; the only illiquid
holdings in the model are `PRIVATE_EQUITY`'s portfolio companies, and no insurer or pension fund
is an LP (the commitments on the contract store name entities, and the seed does not put insurers there).
So the thing an insurer is *paid* for — bearing illiquidity because it does not face redemption —
earns it nothing. MISSING, not out of scope; small once PE's LP list can name them.

### ⚠️ C2 / C5 — MANDATE-SHAPED, NOT LIABILITY-SHAPED

C2.a is the node this tree was most worried about and the code has it: `sovereignCoreShare` (0.70
insurer, 0.75 pension) is applied at `07c-sovereign-bond-clearing.ts:416` as
`minHoldingLocal` — a floor the entity buys **at any yield**, which is exactly the one-way demand the
node asks for, expressed as a real bid rather than an assigned holding. `preferredCreditDurationYears: 6.0`
does the same job in the credit book.

What diverges is that both are properties of the *kind*, not of the entity's own liabilities: two
pension funds with completely different maturity profiles run the same core share and the same
preferred duration. C5's downgrade path is `subInvestmentGradeSizeFactor` (0.08 / 0.10), a
permanent size multiplier rather than a mandate limit that a downgrade can breach — nothing
**forces a sale** when a name crosses out of investment grade. Both close when B1 gives the entity
a liability of its own to match against; recorded here, no separate step.

### ❌ D5 — ONE VERIFY NOBODY TAKES

Nothing measures a large rate move against the three things it should move (liability up, hedge
down, cash on the hedge only). It cannot be measured until B1 exists, and when it does it is
**a measurement, for §3 step 38.**

### Also marked, briefly

- **A2 ⚠️** — the liability is one balance, not stated amounts at stated times — B1 above.
- **B3 ⚠️** — `remainingLifeExpectancyYears` sizes this week's benefit and nothing else; no schedule is uncertain because there is no schedule.
