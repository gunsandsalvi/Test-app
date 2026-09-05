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
  `seniority` field whose only correct value is a constant is the second representation rule 4
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
  number — which is what rule 3 already wants from every book here
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
  - E1.a VERIFY — one walk answers it, over every store that keeps a position
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
  - H3.a the coupon accrues on its book and is paid on the date like every holder's — one
    calendar; its income is what accrued, and the accrued is a receivable on its sheet
- **H4** REASON — monetary financing vs open-market operations is a **policy** constraint, not a
  mechanical one — and A3.b is where this model draws it
- **H5** VERIFY — debt held by the central bank is economically consolidated away and
  accounting-wise is not, and both statements must remain true of the books

### I. THE FUTURE *(added 2026-09-05 from §3 step 17e, the user's words)*
- **I1** REASON — a **deliverable future on the benchmark bond**: a named rung is the deliverable,
  the price is per unit of face, and at delivery the contract settles to that bond's own cleared
  cash price
  - I1.a the **carry** ties it to the cash market: the bond financed in repo to delivery earns its
    coupon and pays the financing, and the print against that is the **net basis** — measured,
    never set
- **I2** REASON — who is on the line: a duration mandate short of duration goes **long** the future
  below carry (the bond financed would cost it more), a holder over its sovereign target **shorts**
  the excess above it, and a dealer quotes **both ways** at carry
- **I3** REASON — the **basis trade**: long the cash bond, financed in repo, short the future when
  the basis pays for it — the largest single source of real repo demand in a real market
  - I3.a FORBID — no basis trader that cannot lose: it is funded, margined and cut on a drawdown

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent (or, on a FORBID node, the
forbidden thing is there). Every citation is checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a fiscal authority with revenue and outlays | `src/domain/government.ts:governmentOutlaysLocal` | ✅ |
| A1.a revenue by base, each with a payer who remits it | `src/domain/company-week/income-statement.ts:corporateTax` | ✅ |
| A1.b outlays by kind, each with a payee | `src/domain/government.ts:decomposeGovernmentSpending` | ✅ |
| A1.c VERIFY the deficit is the residual, never a target | `src/domain/government.ts:governmentObligationsWeeklyLocal` | ✅ |
| **A2 ISSUANCE IS MANAGED TO COVER OUTLAYS** | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:quarterlyFundingNeedLocal` | ⚠️ |
| A2.a the need is the deficit **plus redemptions** | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:quarterlyFundingNeedLocal` | ⚠️ |
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
| B3 N2/N8 fungible within a benchmark LINE | `src/domain/sovereign-id.ts:govBondTrancheId` | ❌ |
| B3.a a re-opening adds to an existing line | — | ❌ |
| B4 FORBID the ranking never varies — all pari passu | `src/domain/region-macro.ts:GovDebtTranche` | ✅ |
| B5 FORBID no covenants, no acceleration | `src/domain/region-macro.ts:GovDebtTranche` | ✅ |
| B6 N11 no early-termination regime; buyback and switch instead | `src/domain/region-macro.ts:GovDebtTranche` | ⚠️ |
| **B7 N13 the claim is on nothing seizable** | — | ❌ |
| C1 issuance is announced before it happens, in a size | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:runFiscalAndSovereignDebtStage` | ⚠️ |
| C1.a the calendar is public ahead of the auction | — | ❌ |
| C1.b the size is the issuer's choice out of A2 | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:quarterlyFundingNeedLocal` | ✅ |
| C2 a uniform-price single-round sealed-bid auction | `src/engine/simulation/stages/financial-clearing-engine.ts:solveClearingStat` | ✅ |
| C3 primary dealers with an obligation to bid | `src/engine/simulation/stages/dealer-desks.ts:buildDealerDeskParticipants` | ⚠️ |
| C3.a the obligation, not a backstop, is why it cannot fail | — | ❌ |
| C3.b the obligation has a cost the dealer wears | — | ❌ |
| C4 VERIFY the tail and the cover ratio | — | ❌ |
| C5 weak demand resolves as a higher yield or a cut size | `src/engine/ledger/tranche-ledger.ts:retireTranche` | ✅ |
| C6 proceeds reach the treasury's account | `src/engine/simulation/stages/book-settlement.ts:primaryTakes` | ✅ |
| C7 paper nobody bid for is withdrawn | `src/engine/ledger/tranche-ledger.ts:retireTranche` | ✅ |
| **D1 it trades: a PRICE per unit** | `src/engine/simulation/stages/07c-sovereign-bond-clearing.ts:runSovereignBondClearingStage` | ✅ |
| **D2 the yield is DERIVED from the price and never sets it** | `src/domain/pricing/bond.ts:yieldFromPrice` | ✅ |
| D3 the curve is a fit through observed points | `src/engine/simulation/stages/sovereign-curve.ts:runSovereignCurveStage` | ✅ |
| **D3.a one owner of the curve** | `src/engine/simulation/stages/sovereign-curve.ts:runSovereignCurveStage` | ✅ |
| D3.b a point is a trade, or is labelled as interpolated | `src/engine/nelsonSiegel.ts:curvePointAt` | ✅ |
| D4 it is the benchmark other credit is spread to | `src/domain/pricing/bond.ts:zeroRateAt` | ✅ |
| D5 repo collateral, at the smallest haircut of any asset | `src/engine/simulation/stages/repo-clearing.ts:computeSovereignRepoHaircuts` | ✅ |
| D6 VERIFY the bid-offer is a consequence, not a prior | `src/domain/dealer-desk.ts:DESK_SPREAD_BPS_BY_BOOK` | ❌ |
| **E1 a register: who holds how much of WHICH LINE** | `src/engine/sovereign-register.ts:forEachSovereignPosition` | ✅ |
| E1.a · and ONE walk answers it, over every store that keeps one | `src/engine/sovereign-register.ts:forEachSovereignPosition` | ✅ |
| E2 holder classes hold for different reasons | `src/engine/simulation/stages/07c-sovereign-bond-clearing.ts:runSovereignBondClearingStage` | ✅ |
| E2.a banks — the regulatory liquidity buffer | `src/engine/macro/banking.ts:liquidityDrivenSovereignFloorLocal` | ✅ |
| E2.b insurers and pensions — duration against liabilities | `src/engine/simulation/stages/07c-sovereign-bond-clearing.ts:durationPremiumBps` | ⚠️ |
| E2.c the central bank — monetary policy | `src/engine/simulation/stages/central-bank-demand.ts:plannedPurchasesByBond` | ✅ |
| E2.d foreign official — reserves | — | ❌ |
| E2.e funds — relative value | — | ❌ |
| E2.f households and corporates, holding it DIRECTLY | `src/engine/simulation/stages/07f-short-debt-clearing.ts:treasuryParticipantId` | ⚠️ |
| **E3 marked at the cleared price** | `src/engine/simulation/stages/register-marking.ts:markRegisterToMarket` | ✅ |
| E4 pledgeable, at a haircut | `src/engine/simulation/stages/repo-clearing.ts:computeSovereignRepoHaircuts` | ✅ |
| E5 a zero risk weight, which is *why* E2.a holds it | `src/engine/macro/banking.ts:riskWeightedAssetsLocal` | ✅ |
| F1 the coupon accrues and is paid to the holder on the date | `src/engine/simulation/stages/sovereign-calendar.ts:runSovereignCalendarStage` | ✅ |
| **F2 a bill ACCRETES; its return is the discount** | `src/engine/simulation/stages/bill-accretion.ts:printedWeeklyReturn` | ✅ |
| F3 principal repaid at maturity out of A3 | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:runFiscalAndSovereignDebtStage` | ⚠️ |
| F4 refinancing at whatever the market charges | `src/engine/nelsonSiegel.ts:calculateNelsonSiegelZeroRate` | ⚠️ |
| **F5 buybacks and switches** | — | ❌ |
| G1 VERIFY in its own money the failure mode is inflation | — | ❌ |
| **G2 in a foreign money it can genuinely default** | — | ❌ |
| G3 a default is selective and negotiated; there is no estate | — | ❌ |
| G4 restructuring by exchange offer, with holdouts | — | ❌ |
| G5 the consequence is exclusion, not liquidation | — | ❌ |
| H1 the central bank buys as policy, in a size it chooses | `src/engine/simulation/stages/central-bank-demand.ts:plannedPurchasesByBond` | ✅ |
| H2 the purchase CREATES reserves; the base grows | `src/engine/simulation/stages/central-bank-demand.ts:bookCentralBankFills` | ✅ |
| H3 the coupon on its holding returns as remittance | `src/engine/simulation/stages/central-bank.ts:runCentralBankStage` | ✅ |
| H3.a the coupon accrues and is paid on the calendar, like every holder's | `src/engine/simulation/stages/sovereign-calendar.ts:accrueSovereignHolders` | ✅ |
| **H4 monetary financing vs OMO is a POLICY constraint** | `src/engine/ledger/accounts.ts:waysAndMeansOf` | ❌ |
| H5 VERIFY consolidated economically, not accounting-wise | — | ❌ |
| I1 a deliverable future on the benchmark bond, settled to its cash price | `src/domain/derivatives/classes/bond-future.ts:BOND_FUTURE_PROFILE` · `src/domain/derivatives/classes/bond-future.ts:deliverableOf` | ✅ |
| I1.a the carry, and the net basis measured | `src/domain/derivatives/classes/bond-future.ts:bondFuturesCarryPrice` · `src/domain/derivatives/classes/bond-future.ts:bondFuturesNetBasis` | ✅ |
| I2 duration mandates long below carry, holders over target short above it, dealers two-way | `src/engine/simulation/stages/derivative-markets/bond-future.ts:runBondFuturesMarket` · `src/domain/derivatives/classes/bond-future.ts:bondFutureHolderQuote` | ✅ |
| I3 the basis trade — long cash in repo, short the future | `src/domain/relative-value.ts:bondBasisRead` · `src/domain/relative-value.ts:bondBasisLegs` · `src/engine/simulation/stages/relative-value.ts:runRelativeValueStage` | ✅ |
| I3.a FORBID no basis trader that cannot lose | `src/domain/relative-value.ts:pairPnLLocal` · `src/domain/relative-value.ts:stoppedOut` | ✅ |

---

## 3. THE DIFF

**74 rows: 39 ✅, 11 ⚠️, 24 ❌** — counted by `test/atlas-marks.test.ts` on every commit now. It had
drifted three times by hand (25/15/27 against 28/12/27, then 30/13/25 against 31/12/25 in the very
paragraph that lectured about drift): `check-atlas.sh` proves a citation RESOLVES and can say
nothing about whether a mark is TRUE, which is §5's lesson, and the test is the answer to it.

The mapping is still the weakest of the four credit trees, and the reason is one thing said twice:
**the sovereign is not an instrument here, and it cannot fail.** What has closed since is the first
half — D1, D2, E1 and the five parallel structures — and the whole of G and half of A remain, out
of the second.

### ✅ E1.a — CLOSED: A SOVEREIGN HOLDING LIVES IN ONE STORE, AND ONE WALK ANSWERS

E1 asks who holds how much of WHICH LINE, and §3.13-SOV row 3 answered it: every store keys by the
bond's own tranche id. What row 3 did not give them is one SHAPE. A government holding sat in the
register (institutions, since §9.13-EQUITY households, since §9.13-BOOK d3a the CENTRAL BANK,
since d3b the BANKS' OWN BOOKS, since d3c the companies' TREASURY BOOKS) and in each bank's desk
inventory — the one holder class the register did not hold. Since §9.13-BOOK d3d it is ONE store:
the desks are rows on their banks' securities books, and `forEachSovereignPosition` is a filter
over `registerBooks` that classifies a row by its book's payee (`DESK` off `BANK_SECURITIES`).

**Five places open-coded the walk over those stores**: the seed's stock reconciliation,
`holdings-view`'s ownership shares, `O1`'s sovereign arm, `O11`'s stray-id check and the UI's
holder list. Each could fall out of date about which stores exist, and they had:
`holdings-view` counted the banks and the central bank and **not the desks**; `O11` walked four
stores and not the treasuries; the UI's list showed **the institutions alone**, so the view of who
owns a government's debt omitted most of its holders and said nothing about it; and none of the
five had heard of the household books. That is rule 4 applied to a READ rather than to a number.

`engine/sovereign-register.ts` is the one walk, and those callers are projections of it. The node
stays ⚠️ because the walk is a plaster over the shape: it exists precisely BECAUSE there are five
stores, and §3's **13-OUTSIDE** is the step that removes them. The seed keeps its own walk, and the
reason is the moment rather than the shape — it runs before the register exists.

**A sixth copy of the walk, and it was offering paper that was already held (§9.13-OUTSIDE).**

`sovereign-register.ts` exists because five places open-coded the walk over the five stores that
keep a government bond, and its header says so. **07c held a sixth**, and being a copy is not what
made it interesting — it had rotted twice over:

- It summed `quantityOrNotionalLocal`, the MARK, and subtracted it from `outstandingLocal`, which
  is the ladder's FACE. Since §9.13's register marking began pricing sovereign rows at their
  cleared print, mark < face for any bond below par — so the shortfall was overstated by the whole
  discount. That shortfall is not a diagnostic: `07c` assigns it straight to
  `primaryOfferingLocal`, so **the treasury re-offered paper somebody already held**, every week,
  by the size of the discount on its own curve.
- It read `e.itemizedHoldings` from inside the window where `context.ts` states those arrays are
  stale week-start snapshots (the store is authoritative between the build before 07b and the
  write-back after 07e; 07c runs between them).

Replaced by `sovereignHeldByBond`, which returns `units` — the face — off the store, so both sides
of the subtraction are now the same quantity and the walk sees the week's real positions.

**07f had the same defect, worse.** Its `primaryOfferingLocal` subtracted `tradableFloatLocal` —
what the BIDDERS hold, at the MARK — from the ladder's FACE. A bill is discount paper, so its mark
is below par every week of its life: the offering was overstated by the whole discount
*systematically*, not occasionally. And a holder that was not a bidder counted as nobody —
`regionEntities` is filtered by mandate weight, and the household books are not in that book at all.
Both books now ask `forEachSovereignPosition`, which reports face across every store, so E1.a
closes: the walk is one, and both callers use it.

### ✅ D1 / D2 / E1 — THE FIVE PARALLEL STRUCTURES, FOUR OF THEM CLOSED

**KNOWN(13-SOV).** All five rows of the step's table verified against the code as it stands today:

| row | the step says | confirmed at |
|---|---|---|
| 1 type | `GovDebtTranche` is a strict subset of `DebtTranche` | `region-macro.ts:312` — `{id, principalLocal, couponRate, originationWeek, maturityWeek, tenorAtIssuanceYears}`, six fields, every one of them also on `company.ts:75`. No `seniority`, no `rateType`, no `callProtection`, no `paymentsPerYear`, no currency |
| 2 store | ✅ DONE — the ONE tranche store | `reg.govDebtTranches` — 20 read sites across `src`, all of them `(reg.govDebtTranches ?? []).filter/reduce`; the withdrawal rebuilt the array with `.map(t => ({...t}))` |
| 3 holdings | ✅ DONE — every store keys by BOND | `GOV_BOND` register rows on the tranche id for every holder — institutions, the central bank (§9.13-BOOK d3a), the banks' own books (d3b), the treasuries (d3c) and the desks (d3d; the regional `sovBondDealerInventory` roll-up is gone, d3e). One id space; `audit/ownership.ts:o11` is the invariant and `o3` no longer exempts sovereigns |
| 4 clearing | ✅ DONE — `07c` clears a **PRICE** | §9.13-SOV row 4: `statKind: 'PRICE_LIKE'`, each holder's reservation YIELD stated as the price it implies on that bond's own schedule and the yield read back with `yieldFromPrice`. It used to be `YIELD_LIKE`, so the engine valued every sovereign fill at `1` |
| 5 curve | ✅ DONE — ONE owner | `sovereign-curve.ts` fits once through every point the week's sessions cleared and publishes every field as a read of that fit; the auctions clear against the standing curve and deposit what they observed |

Row 3 cost the most nodes and is DONE: E1 asks who holds how much of which LINE, and every store
now answers by bond — F1's coupon is the bond's own (`government.ts:sovereignCouponByBond`), F3's
redemption finds the holders of the bond that matured, and `audit/ownership.ts:o11` fails any
position naming an id no ladder carries. **E1 is re-marked ✅ here**: this prose said "DONE" while
the row above it still read ❌, which is exactly the drift `check-atlas.sh` cannot see.
Rows 4 and 5 are done too, so what remains of the five is row 2's declared delete.

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
sovereign as completely as it is possible to fail. **§3 step 37-OVERDRAFT**, and a medium one: the
mechanism is small (a missed-payment definition, an exchange, a market-access consequence) but it
cannot be built before the treasury's overdraft goes, because today a treasury short of cash draws
`waysAndMeansOf` and the question never arises.

### ❌ A3.b / H4 — THE OVERDRAFT, FROM THE INSTRUMENT'S SIDE

**Already reported in full in `the-treasury.md` §3 D3**, and it belongs here too because it is what
drains branch C of consequence. `accounts.ts:waysAndMeansOf` is `max(0, −treasuryNetOf(region))`,
and `11-fiscal:647` makes it the FIRST TERM of the quarterly issue:
`quarterlyFundingNeedLocal = waysAndMeansOf(v2, regionId) + 13 * marketFundedDeficitLocal`. So the
sequence is spend into an overdraft, then issue to clear it. C5 and C7 are both ✅ —
07c/07f genuinely retire paper nobody bought, off the bond's own row, which is the right mechanism —
but a failed auction costs the treasury nothing, because the advance absorbs the gap and the next
calendar week asks for more. A3.a is ⚠️ for the same reason: the account is real and can run low,
and "low" has no consequence. H4 is the same fact from the monetary side: the node says this model
draws the monetary-financing line at A3.b, and it does not draw it.

### ✅ F2 / E3 — CLOSED: A BILL'S RETURN IS THE DISCOUNT ITS OWN AUCTION PRINTED, AND EVERY HOLDER'S BILL IS MARKED

**What this said, and what it got half right.** `bill-accretion` accreted a held bill at whatever
`tenor3M` said THIS week — an interpolated point on a fitted curve — so a holder that bought a
52-week bill at 5% accreted at 2% if the curve fell and 8% if it rose. The stage's own header
states the conservation it is built on (*"the government receives discounted proceeds at issue and
repays FACE at redemption … it equals the accretion its holders accumulated"*), and that identity
could not hold against a rate the curve was re-drawing every week.

**§9.13-BILL closed it by making the return a READ of the bill's own printed price**, not by
locking the rate at purchase — and the difference matters, because this entry originally argued
*"a discount instrument's return is locked at purchase; that is the whole of what a discount is."*
That is the AMORTISED-COST convention, and it is the one this model has decided against everywhere
(step 13: *"an asset genuinely not traded is carried at COST, and carried at cost is a DECLARED
property"* — a bill trades weekly). Two things follow from marking instead. The conservation is
exact rather than approximate: the holders' total gain over a bill's life is `face × (1 − p₀)`
whatever path the price took, because it ends at par, and that is precisely the treasury's cost.
And a bill that CHANGES HANDS is right — under the locked-rate reading the buyer would accrete at
the ISSUER's original yield rather than at the price it actually paid.

**E3 closed with it (§9.13-BOOK d3d).** The register marks a bill at `units × price` like every
other row — the central bank's bills and the banks' own since §9.13-BOOK d3a and d3b, the
treasuries' since d3c, and the desks' since d3d, when the last store that kept a VALUE with no
quantity of its own (`dealerDeskInventory`, `inventoryLocal` where no session had written `units`)
stopped existing. Every holder's bill is a register row with a face and a mark.

### ❌ C1.a / C3.a / C3.b / C4 / ⚠️ C3 — THE AUCTION HAS NO CALENDAR, NO PRIMARY DEALERS AND NO STATISTICS

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

### ✅ D3.a / D3.b (both closed) / ❌ D6 — THE CURVE HAD TWO OWNERS, ITS POINTS HAD NO PROVENANCE, AND THE SPREAD HAS NONE

D3.a is closed by §3.13-SOV row 5. It was: `07f` refitted `yieldCurveParams` through its bills plus
four SYNTHETIC points read back off `zeroRates`, then wrote only `tenor3M` and left 2Y–30Y at 07c's
values — the parameters describing one curve and the published points another, each partly derived
from the other, with `P6` measuring all twenty points disagreeing. `sovereign-curve.ts` is the one
owner now: both sessions clear against the standing curve and deposit what they observed, and it
fits once through all of it and publishes every field as a read.

D3.b is closed by §9.25. It was the same defect one level down: `calculateNelsonSiegelZeroRate`
produced a number for any tenor, and no consumer could tell a trade from the fit's opinion. Now
`Region.sovereignCurve` records the week and the tenors the standing fit was made through, and
`nelsonSiegel.ts:curvePointAt` hands back a point with its provenance — `TRADED` (a tranche within
a week of that tenor cleared in the fit's week), `INTERPOLATED` between two trades, `EXTRAPOLATED`
beyond them, `UNTRADED` on the seed's curve. The coupon of a new issue (`11-fiscal`) and the
make-whole's discount rate (`stage08-back.ts`) read a point rather than a number. Two things the
provenance found on the way in: an uncleared BILL used to deposit `zeroRates.tenor3M` — the previous
fit's own output, at the wrong tenor — as an observation (D3.a's shape inside the fit), and a bond
book with nothing to trade deposited the solver's bracket while the price store refused it; only a
trade is a point now. And both sessions anchor a tranche on its OWN last print, taking the curve's
point only for paper that has never traded. Still reading the fit as a number:
`domain/pricing/bond.ts:zeroRateAt`, which interpolates linearly between the five published
points of the fit — a second interpolator over one curve, a lead for `bond.md`'s benchmark row
rather than a defect of this tree. (The player's position marks read the fit too until §9.26-a,
which marks every position at its tranche's own print and deletes `priceSovereignBond` and
`priceCorporateBond`.)

D6 is the node this tree states most sharply and the code contradicts most plainly.
`dealer-desk.ts:56`'s `DESK_SPREAD_BPS_BY_BOOK` states the sovereign spread as a constant, which is
precisely "assuming the liquidity this system is supposed to generate". **Already §3 step 26.**

### ⚠️ A2 / A2.a / A2.b — A CALENDAR, NOT A PROGRAMME

**Already reported in `the-treasury.md` §3 D4.** From this tree's side the one thing to add is
A2.a: the funding need is `waysAndMeansOf + 13 × marketFundedDeficitLocal` and **redemptions are not
in it at all** — `maturedPrincipalLocal` is computed at `11-fiscal:185` for the repayment leg and
never reaches the sizing. The maturity profile is fully knowable (`sovereign-calendar.ts` walks it
weekly), so this is an inputs defect, not a missing mechanism.

### ⚠️ B1 / B6 / ❌ B3 / B3.a — ONE TYPE WHERE THE TREE ASKS FOR TWO, AND A BUCKET WHERE IT ASKS FOR A LINE

B1: a bill and a bond are one `GovDebtTranche` separated by `isDiscountBill(tenor) → tenor < 1.5`,
and every downstream reader carries the test (`weeklyInterestExpenseLocal` filters bills out,
`sovereignCouponByBond` filters them out, `bill-accretion.ts` exists to give them the return the
coupon path does not). B3/B3.a: the tree asks for a benchmark LINE that a re-opening taps; the code
issues each week's paper as its own tranche, so a re-opening has nothing to tap: the line/tranche
distinction the node exists to draw is absent in the other direction now. B6: the
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
central bank chooses its own size per tenor (`plannedPurchasesByBond`), its fills create reserves
through a real wire onto its register book (`bookCentralBankFills`, §9.13-BOOK d3a), and its coupon income nets through to a treasury
remittance that goes NEGATIVE after a hiking cycle (`central-bank.ts:32`), which is the real
phenomenon reproduced rather than modelled separately. A1–A1.c are ✅ throughout: taxes are levied on
real bases and remitted by named payers, outlays decompose to named payees, and the deficit is the
residual of the two. D4 and D5 are ✅ — the sovereign really is the benchmark every credit spread is
struck over and really does carry the smallest haircut, and `computeSovereignRepoHaircuts` derives
that haircut from the bucket's own observed repricing rather than stating it. E5's zero risk weight
is a literal `sovereignLocal * 0.0` in the RWA sum, which is exactly why E2.a's banks hold it.

### Also marked, briefly

- **A4.a ❌** — willingness to pay has no variable because there is no choice to pay — A4 above.
- **E2.e ❌** — funds hold sovereigns for duration fit, never for relative value — 17f.
- **F4 ⚠️** — the refinancing issue's coupon is read off the fitted curve — `the-treasury.md` E3, step 25.
- **G2 / G3 / G4 ❌** — no foreign-money debt, no negotiated default, no exchange offer — the A4/G entry above, 37-OVERDRAFT.

### ✅ I1 / I1.a / I2 / I3 / I3.a — THE FUTURE PRINTS A BASIS, A BOOK TRADES IT, AND THE BOOK CAN LOSE

*2026-09-05 (§9.17e-ii-b).* The book comes off as it went on. When the edge has gone the target
falls below what it holds and each leg is a reduction — the deliverable sold in 07c to the target
at what the auction clears, the line bought back below the edge price. Two cuts are forced, at
any price: the pair has lost more than the initial margin its future leg posted (`pairPnLLocal`,
`stoppedOut` — the house's own measure of the move it was carried for, no tolerance of the fund's
own), or the line no longer carries the position (the broker's haircut widened, the fund's cash
fell: `arbCapacityLocal` below what it holds). A fund forced out at the wides is why a basis can
persist, which is what the FORBID asks for.

*2026-09-05 (§9.17e-ii-a).* The basis trade exists: a `RELATIVE_VALUE` hedge fund (the fifth
strategy, one per region from the seed) reads the registry of comparables
(`domain/relative-value.ts`) — the bond basis its first entry: the net basis annualised on the
cash price against the financing it pays above repo on its prime-brokerage line and the return it
needs on the future's margin (`bondBasisRead`) — sizes the pair by that edge over the line's own
weekly move against what its cash and its broker will carry, and states both legs
(`bondBasisLegs`) before any book opens (`stages/relative-value.ts`): 07c takes the cash leg as
its bid for the deliverable, the futures line takes the short. Its position is its register rows
and its standing cover, never a store of its own. The mirror trade needs a bond borrow (17e-iii).

*2026-09-05 (§9.17e-i).* One line per region, the front quarterly contract on the rung nearest ten
years from delivery (`deliverableOf`), price-like per unit of face, settling to the deliverable's
own cleared cash price on the delivery week (`BOND_FUTURE_PROFILE`). The desks quote two-way at
the carry price — the cash price financed at the repo rate to delivery less the coupon accrued
(`bondFuturesCarryPrice`) — and the duration mandates are on it by the swap book's own gap read,
long for the gap below carry and short for a sovereign excess above it (`bondFutureHolderQuote`).
The print joins `Region.bondFuturesPriceHistory` and the net basis is `Region.bondFuturesBasis`
(`bondFuturesNetBasis`), measured. **What is absent is I3**: the basis trader — long the bond,
financed in repo or prime brokerage, short the future when the basis pays for the financing and
the margin, cut on a drawdown — is the first comparable of §3 step 17f's relative-value book, and
the repo demand step 7 and 30b are missing arrives with it.
