# SYSTEM: SOVEREIGN CREDIT

A government borrows in its own money. Bills and bonds issued by a treasury, held by somebody,
and the benchmark everything else is priced against. Excludes the central bank's own conduct
(its own system) but the boundary with it is branch H.

Node types, per `README.md`: **REASON** (a thing that must exist and cannot be short-circuited),
**VERIFY** (a thing to measure, never to enforce), **FORBID** (a thing that must be absent).

**Satisfies `../instruments/bond.md` N1–N14 in full.** Branch B states only where it answers a contract
node differently from a corporate bond; everything it answers the same way is in the contract and
is not repeated.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut, and revised once against the user's comments before
any mapping — the revisions are recorded per node so the review is auditable.

### A. THE BORROWER
- **A1** REASON — a fiscal authority with revenue and outlays
  - A1.a revenue by base — income, consumption, corporate, payroll — each with a **payer who
    remits it**, never a rate applied to an aggregate
  - A1.b outlays by kind — purchases, transfers, public wages, interest — each with a **payee**
  - A1.c VERIFY — the deficit is the residual of A1.a and A1.b and is never itself a target
- **A2** REASON — **ISSUANCE IS MANAGED TO COVER OUTLAYS** *(user: "state debt issuance needs to
  be managed to cover outlays")*. The treasury has a funding plan: it knows its need, it chooses a
  size and a tenor mix against it, and it issues ahead of the money leaving
  - A2.a the need is the deficit **plus** redemptions falling due
  - A2.b the plan is made BEFORE the outlay, not after the account is empty
  - A2.c the tenor mix is a real choice with a real cost — short is cheap and rolls, long is dear
    and does not
- **A3** REASON — it has one account and every payment leaves it
  - A3.a the account can be **empty**, and that is a real event with a real consequence
  - A3.b FORBID — **there is no central-bank overdraft** *(user: "no overdraft with the central
    bank")*. A treasury that has not funded itself has failed to fund itself; an automatic advance
    converts a fiscal failure into an accounting entry and deletes the reason A2 exists
- **A4** REASON — **it cannot be compelled to pay.** Default is a choice
  - A4.a willingness to pay is a variable, not a constant
  - A4.b in its own money it can always create more; in someone else's it cannot — and that
    distinction is the whole of sovereign credit risk

### B. HOW SOVEREIGN ANSWERS THE BOND CONTRACT

**A sovereign bond is a TYPE of bond, and it must satisfy all fourteen characteristics in
`../instruments/bond.md`** (user, 2026-09-03: *"we can have a different type of bond for sovereign, but
it need to still have all the necessary characteristics of a bond"*). N1–N10 and N14 it answers
exactly as a corporate bond does, and they are not repeated here. Where it answers DIFFERENTLY:

- **B1** REASON — bond **N5**: a **bill** accretes to par and pays no coupon (N5.c); a **bond** pays
  a fixed coupon (N5.a). Two instruments, not one with a flag
- **B2** REASON — bond **N3**: its own money or another's — and per A4.b that single difference is
  the whole of its credit risk
- **B3** REASON — bond **N2/N8**: fungible within a **benchmark line**
  - B3.a a **re-opening** adds to an existing line rather than creating a new one, so the line and
    the tranche are not the same object
- **B4** FORBID — bond **N13.a**: the ranking exists and **never varies. All of it is pari passu.**
  This is not a missing feature and not a field left unused — it is what a sovereign IS, and a
  `seniority` field whose only correct value is a constant is the second representation rule 3
  forbids
- **B5** FORBID — bond **N12**: default is a missed payment and **nothing else**. There are no
  covenants to breach and no acceleration to trigger
- **B6** REASON — bond **N11**: **no early-termination regime.** The issuer manages its curve by
  buyback and switch (F5) rather than by calling
- **B7** REASON — bond **N13**: the claim is on **nothing seizable** — see G3

### C. THE CALENDAR AND THE AUCTION
- **C1** REASON — issuance is **announced before it happens**, in a size
  - C1.a the calendar is public ahead of the auction, which is what lets bidders prepare
  - C1.b the size is the issuer's choice out of A2
- **C2** REASON — **a uniform-price single-round sealed-bid auction** *(user: "C2 you chose" — I
  choose uniform price)*. Every winning bidder pays the stop-out. Chosen because it is what most
  sovereigns now run for bills and bonds, because it removes the winner's-curse adjustment a
  multiple-price auction forces every bidder to make, and because it needs exactly one cleared
  number — which is what rule 1 already wants from every book here
- **C3** REASON — **primary dealers with an obligation to bid**, in exchange for privileges
  - C3.a this obligation — **not** a central-bank backstop — is why a sovereign auction
    technically cannot fail
  - C3.b the obligation has a cost: the dealer must bid, and may bid badly, and wears it
- **C4** VERIFY — the **tail** (stop-out vs average) and the **cover ratio** are the information
  the market reads out of an auction
- **C5** REASON — weak demand resolves as a **higher yield**, or as the issuer **cutting the size**
- **C6** REASON — proceeds reach the treasury's account
- **C7** REASON — paper nobody bid for is withdrawn, or taken by dealers at the stop-out

### D. THE SECONDARY MARKET AND THE CURVE
- **D1** REASON — it trades: a **price** per unit
- **D2** REASON — the yield is **derived** from the price and never sets it
- **D3** REASON — the curve is a fit through **observed** points
  - D3.a one owner of the curve
  - D3.b a tenor's point is a trade, or is interpolated **and labelled as interpolated**
- **D4** REASON — it is **the benchmark**: other credit is priced as a spread to it
- **D5** REASON — it is repo collateral, at the smallest haircut of any asset
- **D6** VERIFY — **the bid-offer is a consequence, not a prior** *(user)*. Depth, competition
  between dealers and the size of the float produce it; that sovereign spreads come out tightest
  is something to MEASURE, and a stated tight spread would be assuming the liquidity this system
  is supposed to generate

### E. THE HOLDERS
- **E1** REASON — a register: who holds how much of **which line**
- **E2** REASON — holder classes hold for **different reasons**, which is what gives an auction two
  sides
  - E2.a banks — the regulatory liquidity buffer (and E5 is why)
  - E2.b insurers and pensions — duration against their own liabilities
  - E2.c the central bank — monetary policy (branch H)
  - E2.d foreign official — reserves
  - E2.e funds — relative value
  - E2.f **households and corporates, holding it DIRECTLY** *(user: "households and corporates, an
    alternative to MMF")*. A saver's choice between a money fund and the bills the fund would have
    bought is a real substitution, and it is the channel by which a policy rate reaches a
    depositor who is not a bank's customer
- **E3** REASON — marked at the cleared price
- **E4** REASON — pledgeable, at a haircut
- **E5** REASON — a zero risk weight, which is *why* E2.a holds it at all

### F. THE LIFE
- **F1** REASON — coupon accrues to the holder of record and is paid to whoever holds it on the date
- **F2** REASON — a bill **accretes**; its return is the discount
- **F3** REASON — principal repaid at maturity out of A3
- **F4** REASON — refinancing: the issue that funds the redemption, at whatever the market charges
- **F5** REASON — **buybacks and switches** *(user: "F5 good")*. The issuer manages its own curve:
  buying in an illiquid old line and switching holders into a benchmark is a real operation and a
  real cost, and it is part of A2's management

### G. WHEN IT GOES WRONG
- **G1** VERIFY — in its own money the failure mode is **inflation**, not default
- **G2** REASON — in a foreign money it can genuinely default
- **G3** REASON — a default is selective and negotiated. **There is no estate** — nothing to seize
- **G4** REASON — restructuring by exchange offer, with holdouts
- **G5** REASON — the consequence is exclusion from the market, not liquidation

### H. THE MONETARY BOUNDARY
- **H1** REASON — the central bank buys sovereign paper as policy, in a size **it** chooses
- **H2** REASON — the purchase **creates reserves**; the base grows
- **H3** REASON — the coupon on its holding returns to the treasury as remittance
- **H4** REASON — monetary financing vs open-market operations is a **policy** constraint, not a
  mechanical one — and A3.b is where this model draws it
- **H5** VERIFY — debt held by the central bank is economically consolidated away and
  accounting-wise is not, and both statements must remain true of the books

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent (or, on a FORBID node, the
forbidden thing is there). Every citation is checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a fiscal authority with revenue and outlays | `src/domain/government.ts:governmentOutlaysUSD` | ✅ |
| A1.a revenue by base, each with a payer who remits it | `src/domain/company-week/income-statement.ts:corporateTax` | ✅ |
| A1.b outlays by kind, each with a payee | `src/domain/government.ts:decomposeGovernmentSpending` | ✅ |
| A1.c VERIFY the deficit is the residual, never a target | `src/domain/government.ts:governmentObligationsWeeklyUSD` | ✅ |
| **A2 ISSUANCE IS MANAGED TO COVER OUTLAYS** | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:quarterlyFundingNeedUSD` | ⚠️ |
| A2.a the need is the deficit **plus redemptions** | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:quarterlyFundingNeedUSD` | ⚠️ |
| **A2.b the plan is made BEFORE the outlay** | — | ❌ |
| A2.c the tenor mix is a real choice with a real cost | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:steepnessAdjustment` | ✅ |
| A3 one account, and every payment leaves it | `src/engine/ledger/accounts.ts:treasuryAccountOf` | ✅ |
| A3.a the account can be EMPTY, with a real consequence | `src/engine/ledger/accounts.ts:treasuryNetOf` | ⚠️ |
| **A3.b FORBID no central-bank overdraft** | `src/engine/ledger/accounts.ts:waysAndMeansOf` | ❌ |
| **A4 it cannot be compelled to pay; default is a choice** | — | ❌ |
| A4.a willingness to pay is a variable | — | ❌ |
| **A4.b its own money versus someone else's** | `src/domain/geography.ts:currencyOf` | ❌ |
| B1 N5 a bill accretes, a bond pays — two instruments | `src/domain/government.ts:isDiscountBill` | ⚠️ |
| B2 N3 its own money or another's | `src/domain/geography.ts:currencyOf` | ❌ |
| B3 N2/N8 fungible within a benchmark LINE | `src/domain/sovereign-id.ts:govBucketId` | ⚠️ |
| B3.a a re-opening adds to an existing line | `src/domain/sovereign-id.ts:govBucketKeyOf` | ⚠️ |
| B4 FORBID the ranking never varies — all pari passu | `src/domain/region-macro.ts:GovDebtTranche` | ✅ |
| B5 FORBID no covenants, no acceleration | `src/domain/region-macro.ts:GovDebtTranche` | ✅ |
| B6 N11 no early-termination regime; buyback and switch instead | `src/domain/region-macro.ts:GovDebtTranche` | ⚠️ |
| **B7 N13 the claim is on nothing seizable** | — | ❌ |
| C1 issuance is announced before it happens, in a size | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:runFiscalAndSovereignDebtStage` | ⚠️ |
| C1.a the calendar is public ahead of the auction | — | ❌ |
| C1.b the size is the issuer's choice out of A2 | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:quarterlyFundingNeedUSD` | ✅ |
| C2 a uniform-price single-round sealed-bid auction | `src/engine/simulation/stages/financial-clearing-engine.ts:solveClearingStat` | ✅ |
| C3 primary dealers with an obligation to bid | `src/engine/simulation/stages/dealer-desks.ts:buildDealerDeskParticipants` | ⚠️ |
| C3.a the obligation, not a backstop, is why it cannot fail | — | ❌ |
| C3.b the obligation has a cost the dealer wears | — | ❌ |
| C4 VERIFY the tail and the cover ratio | — | ❌ |
| C5 weak demand resolves as a higher yield or a cut size | `src/domain/government.ts:withdrawUnplacedIssuance` | ✅ |
| C6 proceeds reach the treasury's account | `src/engine/simulation/stages/book-settlement.ts:primaryTakes` | ✅ |
| C7 paper nobody bid for is withdrawn | `src/domain/government.ts:withdrawUnplacedIssuance` | ✅ |
| **D1 it trades: a PRICE per unit** | — | ❌ |
| **D2 the yield is DERIVED from the price and never sets it** | `src/engine/simulation/stages/07c-sovereign-bond-clearing.ts:runSovereignBondClearingStage` | ❌ |
| D3 the curve is a fit through observed points | `src/engine/nelsonSiegel.ts:fitNelsonSiegelParams` | ⚠️ |
| **D3.a one owner of the curve** | `src/engine/simulation/stages/07f-short-debt-clearing.ts:runShortDebtClearingStage` | ❌ |
| D3.b a point is a trade, or is labelled as interpolated | `src/engine/nelsonSiegel.ts:calculateNelsonSiegelZeroRate` | ❌ |
| D4 it is the benchmark other credit is spread to | `src/domain/pricing/bond.ts:zeroRateAt` | ✅ |
| D5 repo collateral, at the smallest haircut of any asset | `src/engine/simulation/stages/repo-clearing.ts:computeSovereignRepoHaircuts` | ✅ |
| D6 VERIFY the bid-offer is a consequence, not a prior | `src/domain/dealer-desk.ts:DESK_SPREAD_BPS_BY_BOOK` | ❌ |
| **E1 a register: who holds how much of WHICH LINE** | `src/domain/banking.ts:sovereignBondHoldingsByTenor` | ❌ |
| E2 holder classes hold for different reasons | `src/engine/simulation/stages/07c-sovereign-bond-clearing.ts:runSovereignBondClearingStage` | ✅ |
| E2.a banks — the regulatory liquidity buffer | `src/engine/macro/banking.ts:liquidityDrivenSovereignFloorUSD` | ✅ |
| E2.b insurers and pensions — duration against liabilities | `src/engine/simulation/stages/07c-sovereign-bond-clearing.ts:durationPremiumBps` | ⚠️ |
| E2.c the central bank — monetary policy | `src/engine/simulation/stages/central-bank-demand.ts:plannedPurchasesByTenor` | ✅ |
| E2.d foreign official — reserves | — | ❌ |
| E2.e funds — relative value | `src/engine/simulation/stages/07c-sovereign-bond-clearing.ts:realYieldSignal` | ✅ |
| E2.f households and corporates, holding it DIRECTLY | `src/engine/simulation/stages/07f-short-debt-clearing.ts:treasuryParticipantId` | ⚠️ |
| **E3 marked at the cleared price** | — | ❌ |
| E4 pledgeable, at a haircut | `src/engine/simulation/stages/repo-clearing.ts:computeSovereignRepoHaircuts` | ✅ |
| E5 a zero risk weight, which is *why* E2.a holds it | `src/engine/macro/banking.ts:riskWeightedAssetsUSD` | ✅ |
| F1 the coupon accrues and is paid to the holder on the date | `src/engine/simulation/stages/sovereign-calendar.ts:runSovereignCalendarStage` | ✅ |
| **F2 a bill ACCRETES; its return is the discount** | `src/engine/simulation/stages/bill-accretion.ts:weeklyAccretionRate` | ⚠️ |
| F3 principal repaid at maturity out of A3 | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:runFiscalAndSovereignDebtStage` | ⚠️ |
| F4 refinancing at whatever the market charges | `src/engine/nelsonSiegel.ts:calculateNelsonSiegelZeroRate` | ⚠️ |
| **F5 buybacks and switches** | — | ❌ |
| G1 VERIFY in its own money the failure mode is inflation | — | ❌ |
| **G2 in a foreign money it can genuinely default** | — | ❌ |
| G3 a default is selective and negotiated; there is no estate | — | ❌ |
| G4 restructuring by exchange offer, with holdouts | — | ❌ |
| G5 the consequence is exclusion, not liquidation | — | ❌ |
| H1 the central bank buys as policy, in a size it chooses | `src/engine/simulation/stages/central-bank-demand.ts:plannedPurchasesByTenor` | ✅ |
| H2 the purchase CREATES reserves; the base grows | `src/engine/simulation/stages/central-bank-demand.ts:wireCentralBankFills` | ✅ |
| H3 the coupon on its holding returns as remittance | `src/engine/simulation/stages/central-bank.ts:runCentralBankStage` | ✅ |
| **H4 monetary financing vs OMO is a POLICY constraint** | `src/engine/ledger/accounts.ts:waysAndMeansOf` | ❌ |
| H5 VERIFY consolidated economically, not accounting-wise | — | ❌ |

---

## 3. THE DIFF

**67 nodes: 25 ✅, 15 ⚠️, 27 ❌.** This is the weakest mapping of the four credit trees and the
reason is one thing said twice: **the sovereign is not an instrument here, and it cannot fail.**
Branches D and E fall out of the first; the whole of G and half of A out of the second.

### ❌ D1 / D2 / E1 / E3 — THE FIVE PARALLEL STRUCTURES, EACH CONFIRMED AT ITS LINE

**KNOWN(13-SOV).** All five rows of the step's table verified against the code as it stands today:

| row | the step says | confirmed at |
|---|---|---|
| 1 type | `GovDebtTranche` is a strict subset of `DebtTranche` | `region-macro.ts:312` — `{id, principalUSD, couponRate, originationWeek, maturityWeek, tenorAtIssuanceYears}`, six fields, every one of them also on `company.ts:75`. No `seniority`, no `rateType`, no `callProtection`, no `paymentsPerYear`, no currency |
| 2 store | a plain array, not the engine2 tranche store | `reg.govDebtTranches` — 20 read sites across `src`, all of them `(reg.govDebtTranches ?? []).filter/reduce`; `withdrawUnplacedIssuance` rebuilds the array with `.map(t => ({...t}))` |
| 3 holdings | a bucket with **no instrument in it** | `banking.ts:129` `sovereignBondHoldingsByTenor: Record<string, number>` for banks, `centralBankSheet.sovereignHoldingsByTenor` for the CB, `sovBondDealerInventory[].tenorKey` for the desks, and `GOV_BOND` register rows keyed by `sovereign-id.ts:govBucketId` (`USA\|t10`) for institutions — **four holder registers, none of them naming a bond** |
| 4 clearing | `07c` clears a **YIELD** | `07c:331` `statKind: 'YIELD_LIKE'`, `currentStat: currentYieldDecimal * 10000`; `financial-clearing-engine.ts:956` then values every fill at `1` because the stat is not `PRICE_LIKE` |
| 5 curve | its own object | `07c:517-524` writes `reg.zeroRates` from the cleared yields and `reg.yieldCurveParams` from a fit through them, in the same pass |

Row 3 is the one that costs the most nodes. **E1 asks who holds how much of which LINE and the
model cannot answer at any granularity finer than a tenor bucket**, which is why F3's redemption
shrinks every holder pro-rata (`11-fiscal:200-225`), why F1's coupon pays each holder the bucket's
**principal-weighted average** coupon rather than its own bond's (`government.ts:sovereignCouponByBucket`),
and why `auditOwnership` can reconcile bucket sums while nobody can say who owns anything.
Row 4 is D2 exactly inverted: the node says the yield is derived from the price and never sets it,
and the yield is the only thing that clears.

### ❌ A4 / A4.b / B2 / B7 / G1–G5 — A SOVEREIGN THAT CANNOT DEFAULT, AND CANNOT BORROW IN ANOTHER MONEY

**Ten nodes, one absence, and it is a genuinely new one.** There is no sovereign default path
anywhere in `src`: no missed-payment test on the government, no exchange offer, no exclusion, no
foreign-currency sovereign debt. `GovDebtTranche` has no currency field and every sovereign payment
takes `currencyOf(regionId)`, so **every government in this model borrows exclusively in the money
it prints** — which makes A4.b ("in its own money it can always create more; in someone else's it
cannot — and that distinction is the whole of sovereign credit risk") not merely unmodelled but
inexpressible.

The consequence is bigger than the branch. A sovereign that cannot fail is what lets `07c` price
its paper with `hasCreditRisk: false` (`assets/index.ts:71`) and lets D4's benchmark role be
unconditional. And there IS a sovereign rating — `evolution.ts:70,931` derives one from the real
debt ratio and the real deficit, on thresholds, every 26 weeks — whose **only consumers anywhere are
five UI strings** (`curve.tsx:47`, `region.tsx:67`, `macro.tsx:95`, `curves.tsx:78`,
`statements.tsx:240`). Nothing prices off it, nothing is bound by it, nothing sells on a downgrade.
That is `ratings-and-assessment.md` **E1** — a rating with no consequence — failing for the
sovereign as completely as it is possible to fail. **Becomes a §3 step**, and a medium one: the
mechanism is small (a missed-payment definition, an exchange, a market-access consequence) but it
cannot be built before the treasury's overdraft goes, because today a treasury short of cash draws
`waysAndMeansOf` and the question never arises.

### ❌ A3.b / H4 — THE OVERDRAFT, FROM THE INSTRUMENT'S SIDE

**Already reported in full in `the-treasury.md` §3 D3**, and it belongs here too because it is what
drains branch C of consequence. `accounts.ts:waysAndMeansOf` is `max(0, −treasuryNetOf(region))`,
and `11-fiscal:647` makes it the FIRST TERM of the quarterly issue:
`quarterlyFundingNeedUSD = waysAndMeansOf(v2, regionId) + 13 * marketFundedDeficitUSD`. So the
sequence is spend into an overdraft, then issue to clear it. C5 and C7 are both ✅ —
`withdrawUnplacedIssuance` genuinely retires paper nobody bought, which is the right mechanism —
but a failed auction costs the treasury nothing, because the advance absorbs the gap and the next
calendar week asks for more. A3.a is ⚠️ for the same reason: the account is real and can run low,
and "low" has no consequence. H4 is the same fact from the monetary side: the node says this model
draws the monetary-financing line at A3.b, and it does not draw it.

### ⚠️ F2 — A BILL ACCRETES AT THIS WEEK'S CURVE, NOT AT THE YIELD IT WAS BOUGHT AT — **NEW**

`bill-accretion.ts:26-35`:

```
const annual = bucket.years <= 0.3 ? reg.zeroRates.tenor3M
             : reg.zeroRates.tenor3M + (reg.zeroRates.tenor2Y - reg.zeroRates.tenor3M) * (bucket.years / 2);
return Math.max(-0.5, annual) / 52;
```

A holder that bought a 52-week bill at 5% accretes at whatever `tenor3M` says THIS week — 2% if the
curve fell, 8% if it rose. **A discount instrument's return is locked at purchase; that is the whole
of what a discount is.** The stage's own header states the conservation it is built on: *"the
government receives discounted proceeds at issue and repays FACE at redemption. The difference is
its whole cost, and it equals the accretion its holders accumulated over the same period."* That
identity holds only if the accretion rate is the ISSUE yield. It is not, so the two legs differ by
the curve's drift over the bill's life, in either direction, and nothing measures the gap — the
issue price is struck at `07f:375` from the cleared yield and then thrown away, exactly the shape
step 13 names for goods (`setOutputStock` keeps the product and loses the price).

Not named in the plan. **Becomes a §3 step** — small, and it folds naturally into 13-SOV, which has
to give the bill a stored issue price anyway to become a `DebtTranche`.

### ❌ C1.a / C3 / C3.a / C3.b / C4 — THE AUCTION HAS NO CALENDAR, NO PRIMARY DEALERS AND NO STATISTICS

Four absences, one shape: the sovereign auction is a clearing session and not an auction.
`11-fiscal:630` gates issuance on `nextWeek % 13 === 0` and the tranche is created and placed in
the same pass, so **nothing is ever announced ahead of being sold** (C1, C1.a). The desks
(`buildDealerDeskParticipants`) make markets in sovereigns exactly as they do in every other book —
with capacity, inventory and a spread — but there is no primary-dealer status, no obligation to bid
and therefore no privilege paid for it (C3, C3.b); `grep -rn "primary dealer" src` returns nothing.
C4's tail and cover ratio have no code at all, which matters more than it looks: they are the two
numbers a real market reads an auction's *strength* by, and without them a weak auction and a strong
one are indistinguishable to every participant. C2 IS ✅ and correctly so — the engine clears one
stat and every filled bidder gets it, which is a uniform-price auction.

C3.a deserves its own line because the code answers it BETTER than the node does: the tree says a
sovereign auction technically cannot fail because primary dealers must bid, and this model lets it
fail and withdraws the unplaced paper. That is the more honest mechanism. But the reason it is
survivable here is the overdraft, not a dealer's obligation — so the node is ❌ and the tree's own
claim should be revisited when A3.b is fixed.

### ❌ D3.a / D3.b / D6 — THE CURVE HAS TWO OWNERS AND THE SPREAD HAS NONE

**Already §3 step 25** for D3.a: `07f:461` refits `yieldCurveParams` through bills-plus-bonds while
leaving `zeroRates.tenor2Y…30Y` at 07c's cleared values, against `07c`'s own header claiming sole
ownership. D3.b is the same defect one level down and is not in the step: `calculateNelsonSiegelZeroRate`
is called at 15 sites to produce a rate for a tenor nobody traded — a coupon at `11-fiscal:615,656`,
a make-whole discount rate at `call-protection.ts:96`, a refinancing's fair rate at
`stage08-back.ts:1432` — and **no consumer can tell an interpolated point from a cleared one**,
because the return type is a number. Worth adding to step 25: the fit should return points that
carry their own provenance.

D6 is the node this tree states most sharply and the code contradicts most plainly.
`dealer-desk.ts:56`'s `DESK_SPREAD_BPS_BY_BOOK` states the sovereign spread as a constant, which is
precisely "assuming the liquidity this system is supposed to generate". **Already §3 step 26.**

### ⚠️ A2 / A2.a / A2.b — A CALENDAR, NOT A PROGRAMME

**Already reported in `the-treasury.md` §3 D4.** From this tree's side the one thing to add is
A2.a: the funding need is `waysAndMeansOf + 13 × marketFundedDeficitUSD` and **redemptions are not
in it at all** — `maturedPrincipalUSD` is computed at `11-fiscal:185` for the repayment leg and
never reaches the sizing. The maturity profile is fully knowable (`sovereign-calendar.ts` walks it
weekly), so this is an inputs defect, not a missing mechanism.

### ⚠️ B1 / B3 / B3.a / B6 — ONE TYPE WHERE THE TREE ASKS FOR TWO, AND A BUCKET WHERE IT ASKS FOR A LINE

B1: a bill and a bond are one `GovDebtTranche` separated by `isDiscountBill(tenor) → tenor < 1.5`,
and every downstream reader carries the test (`weeklyInterestExpenseUSD` filters bills out,
`sovereignCouponByBucket` filters them out, `bill-accretion.ts` exists to give them the return the
coupon path does not). B3/B3.a: the tree asks for a benchmark LINE that a re-opening taps; the code
has a tenor BUCKET that pools every bond of that tenor ever issued, so the line/tranche distinction
the node exists to draw does not exist — a re-opening and a new issue are the same act. B6: the
sovereign correctly has no call machinery, which is the right answer, and it also has no buyback and
no switch (F5 ❌), so the issuer has no way at all to manage its own curve. All three fold into
**§3 step 13-SOV** and the first two into **§3 step 16**'s tap-versus-facility question.

### ⚠️ E2.b / E2.f / ❌ E2.d — THE HOLDER BASE IS THREE CLASSES, NOT SIX

E2 itself is ✅ and it is the strongest thing in this tree: banks bid off reserve arbitrage and an
HQLA floor, institutions off real yield and duration fit, the central bank off policy — three
genuinely different reasons, which is what gives the auction sides. What is missing is the tail.
**E2.b** is ⚠️ because the duration preference is `INSTITUTIONAL_PREFERRED_TENOR_YEARS = 12`, one
constant for every insurer and pension fund, where the node asks for each holder's own liability
profile. **E2.d** is ❌: `foreignOfficialClaimsUSD` exists on the central-bank sheet, is seeded at 0
(`initialization.ts:629`) and is an FX-reserve line, not a sovereign-bond holder — there is no
reserve manager bidding in any auction. **E2.f** is ⚠️: corporate treasuries DO bid, for bills, in
`07f` (`treasuryParticipantId`), which is the user's own substitution working — but households
never hold a bill directly, so the channel by which a policy rate reaches a saver who is not a
bank's customer runs only through the money fund.

### ❌ G1 / H5 / C4 — THREE VERIFY NODES NOBODY MEASURES

Nothing measures inflation as the own-money failure mode (G1), nothing measures the consolidated-
versus-accounting treatment of central-bank-held debt (H5), and nothing computes an auction tail or
cover ratio (C4). All three are reads, not mechanisms. **A measurement, for §3 step 38.**

### PRESENT AND NOT WORTH RE-CHECKING

Branch H is the surprise of this mapping: **H1, H2 and H3 are all ✅** and properly wired — the
central bank chooses its own size per tenor (`plannedPurchasesByTenor`), its fills create reserves
through a real wire (`wireCentralBankFills`), and its coupon income nets through to a treasury
remittance that goes NEGATIVE after a hiking cycle (`central-bank.ts:32`), which is the real
phenomenon reproduced rather than modelled separately. A1–A1.c are ✅ throughout: taxes are levied on
real bases and remitted by named payers, outlays decompose to named payees, and the deficit is the
residual of the two. D4 and D5 are ✅ — the sovereign really is the benchmark every credit spread is
struck over and really does carry the smallest haircut, and `computeSovereignRepoHaircuts` derives
that haircut from the bucket's own observed repricing rather than stating it. E5's zero risk weight
is a literal `sovereignUSD * 0.0` in the RWA sum, which is exactly why E2.a's banks hold it.
