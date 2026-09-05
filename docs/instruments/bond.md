# INSTRUMENT CONTRACT: THE BOND

Not a system — an **instrument contract**. Every tree whose instrument is a bond must satisfy all
of it, and says per node HOW it satisfies it. Cited by `../systems/corporate-credit.md`, `../systems/sovereign-credit.md` and
`../systems/short-term-debt.md`.

**Why this file exists** (user, 2026-09-03: *"we can have a different type of bond for sovereign,
but it need to still have all the necessary characteristics of a bond"*). A sovereign bond and a
corporate bond are different TYPES, not one with fields unused: they differ in the early-
termination regime, in what a holder is entitled to on failure, and in whether seniority varies at
all. What they cannot differ in is the fourteen characteristics below — an instrument missing one
of these is not a bond, and the difference between "this type answers N differently" and "nobody
ever answered N" is the whole point of writing them down separately.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## THE FOURTEEN

- **N1** REASON — an **ISSUER** who owes: a named party with a balance sheet that can be looked at
- **N2** REASON — **PRINCIPAL**, an amount owed, counted in **units of par**
- **N3** REASON — a **CURRENCY** it is denominated in, and every figure about it is in that money
- **N4** REASON — a **MATURITY**: the date the principal is due
- **N5** REASON — a **COUPON**, the compensation for time and risk, in exactly one of three shapes
  - N5.a a **fixed** rate, locked at issuance
  - N5.b a **floating** margin over a NAMED reference rate that is itself observable
  - N5.c **zero** — the return is the discount to par (a bill, a zero)
- **N6** REASON — a **PERIODICITY AND AN ACCRUAL CONVENTION**: how often it pays, and how interest
  accrues between payments. Rule 9 lives here — a rate without its periodicity is not a number
- **N7** REASON — a **PRICE, per unit of par, that it changes hands at**
  - N7.a cleared from real demand against real supply, once per period
  - N7.b FORBID — **the price is never derived from the yield, the spread, the DM or the OAS.**
    Those are derived FROM it. A round trip through a curve cannot return the level it started at,
    and where one exists the print is arithmetic wearing a market's clothes
- **N8** REASON — a **HOLDER OF RECORD**: who owns how many units
  - N8.a VERIFY — Σ(units held) = units issued, always. A unit with no holder or two holders is a
    defect and not a rounding
- **N9** REASON — **TRANSFERABILITY**: it can change hands
  - N9.a two legs in the same pass — the paper one way, the cash the other
  - N9.b **accrued interest travels with it**: the buyer pays the seller what has accrued since the
    last payment, or the coupon is a windfall to whoever happens to hold it on the date
- **N10** REASON — **REDEMPTION**: the principal is repaid and the instrument **ceases to exist**.
  The register empties
- **N11** REASON — an **EARLY-TERMINATION REGIME**, stated even when it is "none": callable,
  prepayable, make-whole, non-call period, or not terminable early
  - N11.a whatever it is, it has a **price** the issuer pays to use it
- **N12** REASON — a **DEFINITION OF DEFAULT**: what counts as failure to perform, observable by a
  holder
- **N13** REASON — a **CLAIM ON FAILURE**: what the holder is entitled to, stated even when the
  answer is "nothing seizable"
  - N13.a and a **ranking** of that claim against the issuer's other claims — stated even when the
    answer is "all equal"
- **N14** REASON — an **IDENTITY a market would use**: issuer + coupon + maturity, or issuer +
  tenor. An internal id is an id, never the name

---

## HOW EACH TYPE ANSWERS

| | corporate bond / loan | sovereign bond / bill |
|---|---|---|
| **N11** early termination | make-whole, non-call, soft call — stamped from what the issue IS | **typically none**; the issuer manages the curve by buyback and switch instead |
| **N12** default | missed payment **or breached covenant** | **missed payment only** — there are no covenants to breach |
| **N13** claim | a claim on an **estate** that is realised and distributed | **nothing seizable**; a negotiated exchange, and the sanction is market exclusion |
| **N13.a** ranking | a real **waterfall**: senior paid in full before subordinated | **pari passu, always** — the ranking exists and never varies |
| **N5** coupon | fixed or floating; floating is common in loans | fixed for bonds, zero for bills; floating is rare |
| **N3** currency | usually the issuer's own, sometimes not | its own or another's — **and that difference is the whole of its credit risk** |

**The consequence for §3.13-SOV.** "The same construction as a normal bond" is right about N1–N10
and N14 and wrong about N11–N13.a: a sovereign that inherits a `seniority` field which must never
vary, and a covenant slot that must stay empty, has two fields whose only correct value is a
constant — which rule 4 calls a second representation and rule 2 calls a primitive that should
not exist. The right shape is the contract above, with each type answering N11–N13 its own way.

---

## 2. THE MAPPING

Mapped 2026-09-03, **for BOTH types** — one row per (characteristic, type), because the whole point
of a contract is that "this type answers N differently" and "nobody ever answered N" are different
answers. `✅` present · `⚠️` present but diverging · `❌` absent (or, on a FORBID node, the forbidden
thing is there). Every citation is checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| N1 · corp an ISSUER who owes | `src/domain/company.ts:Company` | ✅ |
| N1 · sov an ISSUER who owes | `src/domain/government-entity.ts:Government` | ✅ |
| N2 · corp PRINCIPAL, counted in units of par | `src/domain/company.ts:DebtTranche` | ✅ |
| N2 · sov PRINCIPAL, counted in units of par | `src/domain/region-macro.ts:GovDebtTranche` | ⚠️ |
| N3 · corp a CURRENCY it is denominated in | `src/engine/ledger/accounts.ts:obligationCurrencyOf` | ⚠️ |
| N3 · sov a CURRENCY it is denominated in | `src/domain/geography.ts:currencyOf` | ⚠️ |
| N4 · corp a MATURITY | `src/domain/company.ts:DebtTranche` | ✅ |
| N4 · sov a MATURITY | `src/domain/region-macro.ts:GovDebtTranche` | ✅ |
| N5 · corp a COUPON in exactly one of three shapes | `src/domain/company.ts:DebtTranche` | ✅ |
| N5 · sov a COUPON in exactly one of three shapes | `src/domain/government.ts:isDiscountBill` | ⚠️ |
| N5.a · corp a FIXED rate, locked at issuance | `src/domain/company.ts:couponRate` | ✅ |
| N5.a · sov a FIXED rate, locked at issuance | `src/domain/region-macro.ts:GovDebtTranche` | ✅ |
| N5.b · corp a FLOATING margin over a named reference | `src/engine/simulation/stages/07d-leveraged-loan-clearing.ts:runLeveragedLoanClearingStage` | ⚠️ |
| N5.b · sov a FLOATING margin (answer: none) | `src/domain/region-macro.ts:GovDebtTranche` | ✅ |
| N5.c · corp ZERO — the return is the discount to par | `src/domain/company.ts:isCommercialPaper` | ⚠️ |
| N5.c · sov ZERO — the return is the discount to par | `src/engine/simulation/stages/bill-accretion.ts:printedWeeklyReturn` | ✅ |
| N6 · corp a PERIODICITY and an accrual convention | `src/domain/company.ts:paymentsPerYear` | ✅ |
| N6 · sov a PERIODICITY and an accrual convention | `src/domain/government.ts:sovereignCouponDueShare` | ⚠️ |
| N7 · corp a PRICE per unit of par it changes hands at | `src/engine2/prices.ts:setClearedPrice` | ✅ |
| N7 · sov a PRICE per unit of par it changes hands at | `src/engine/simulation/stages/07c-sovereign-bond-clearing.ts:priceAtYieldBps` | ✅ |
| N7.a · corp cleared from real demand against real supply | `src/engine/simulation/stages/financial-clearing-engine.ts:clearFinancialAsset` | ⚠️ |
| N7.a · sov cleared from real demand against real supply | `src/engine/simulation/stages/07c-sovereign-bond-clearing.ts:runSovereignBondClearingStage` | ⚠️ |
| **N7.b · corp FORBID the price is never derived from the spread** | `src/engine/credit-price.ts:trancheClearedPricePerFace` | ✅ |
| N7.b · sov FORBID the price is never derived from the yield | `src/domain/government.ts:billYieldFromPrice` | ✅ |
| N8 · corp a HOLDER OF RECORD: who owns how many units | `src/engine2/holdings.ts:newHoldingStore` | ✅ |
| N8 · sov a HOLDER OF RECORD: who owns how many units | `src/domain/banking.ts:sovereignBondHoldingsByBond` | ✅ |
| N8.a · corp VERIFY Σ units held = units issued | `src/engine/audit/ownership.ts:auditOwnership` | ✅ |
| N8.a · sov VERIFY Σ units held = units issued | `src/engine/audit/ownership.ts:auditOwnership` | ⚠️ |
| N9 · corp TRANSFERABILITY | `src/engine/ledger/holdings-ledger.ts:transferHolding` | ✅ |
| N9 · sov TRANSFERABILITY | `src/engine/simulation/stages/07c-sovereign-bond-clearing.ts:runSovereignBondClearingStage` | ✅ |
| N9.a · corp two legs in the same pass | `src/engine/simulation/stages/book-settlement.ts:settleClearedBook` | ✅ |
| N9.a · sov two legs in the same pass | `src/engine/simulation/stages/book-settlement.ts:settleClearedBook` | ✅ |
| N9.b · corp accrued interest travels with it | `src/engine/simulation/stages/shared-helpers.ts:moveCorporateAccrued` | ⚠️ |
| N9.b · sov accrued interest travels with it | `src/engine/simulation/stages/book-settlement.ts:accruedOnFills` | ✅ |
| N10 · corp REDEMPTION, and it ceases to exist | `src/engine/ledger/tranche-ledger.ts:retireTranche` | ✅ |
| N10 · sov REDEMPTION, and it ceases to exist | `src/engine/simulation/stages/11-fiscal-and-sovereign-debt.ts:runFiscalAndSovereignDebtStage` | ⚠️ |
| N11 · corp an EARLY-TERMINATION REGIME | `src/domain/call-protection.ts:callProtectionForIssue` | ✅ |
| N11 · sov an EARLY-TERMINATION REGIME (answer: none) | `src/domain/region-macro.ts:GovDebtTranche` | ✅ |
| N11.a · corp it has a PRICE the issuer pays to use it | `src/domain/call-protection.ts:callPricePerDollar` | ✅ |
| N11.a · sov it has a PRICE the issuer pays to use it (n/a) | `src/domain/region-macro.ts:GovDebtTranche` | ✅ |
| N12 · corp a DEFINITION OF DEFAULT a holder observes | `src/domain/company-week/credit-standing.ts:isInDefault` | ⚠️ |
| **N12 · sov a DEFINITION OF DEFAULT a holder observes** | — | ❌ |
| N13 · corp a CLAIM ON FAILURE | `src/engine/simulation/stages/estate-resolution.ts:runEstateResolutionStage` | ✅ |
| **N13 · sov a CLAIM ON FAILURE, stated even as "nothing seizable"** | — | ❌ |
| **N13.a · corp a RANKING of that claim** | `src/domain/estate.ts:CLAIM_SENIORITY` | ⚠️ |
| N13.a · sov a RANKING (answer: pari passu, always) | `src/domain/region-macro.ts:GovDebtTranche` | ✅ |
| N14 · corp an IDENTITY a market would use | `src/ui/objects/tranche.tsx:tranche` | ✅ |
| N14 · sov an IDENTITY a market would use | `src/engine/instrument-name.ts:instrumentNameOf` | ✅ |

---

## 3. THE DIFF

**48 rows — 24 nodes (the fourteen plus their ten sub-nodes) × 2 types: 32 ✅, 14 ⚠️, 2 ❌** — counted by `test/atlas-marks.test.ts` on every commit now.

*Re-marked 2026-09-04 at §9.13-CREDIT row 2, catching up four rows the commits that closed them
left behind, and again at row 4, which closed N7 · corp and N7.b · corp: commercial paper was the
last book on either side deriving a price from a cleared spread. Each count above was COUNTED
rather than adjusted, because the tally had drifted on its own too — it once read 20/13/9 against a
table that summed to 21/13/8. The lesson is the file's own: `check-atlas.sh` proves every citation
RESOLVES and can say nothing about whether a mark is still TRUE, so a row nobody re-marks — and a
tally nobody recounts — is the one kind of drift the gate cannot catch.*

The contract's own thesis is confirmed and sharpened: the two types differ correctly at N11, N13
and N13.a — the sovereign genuinely has no call machinery and no seniority field, which is the
right answer and rule 4's. They used to fail IDENTICALLY at N7, N7.b and N14; all three are now
closed on both types (N14 by §9.14, 2026-09-05).

### ✅ N7 / N7.b — CLOSED ON BOTH TYPES: EVERY BOND-SHAPED THING HAS A PRICE IT CHANGES HANDS AT

**What this entry said when it was written, and what has landed since.** It said no bond in this
model had a price per unit of par that it changes hands at: `financial-clearing-engine` values a
fill at `1` for anything whose `statKind` is not `PRICE_LIKE`, and credit (`SPREAD_LIKE`) and
sovereign (`YIELD_LIKE`) were both declared that way. It said N7.b was not merely unmet but
INVERTED — `priceFromSpreadBps` was called and `spreadBpsFromPrice` was called by nothing — and that
step 13's pair-swap, moving the derivation to the participant's side and the inverse to after the
clear, was exactly the fix.

That fix has now landed on all five books, and this is where it stands:

- **SOVEREIGN ✅, both books** (§9.13-SOV row 4). `07c` clears a PRICE per bond, stating each
  holder's reservation yield as the price it implies on that bond's own schedule, and derives the
  yield back with `yieldFromPrice`; `07f`'s bills do the same on the money market's simple-interest
  convention, which is their own and stays theirs (rule 8). `discountBillProceedsLocal` is still the
  price-from-yield direction and that is now PERMITTED, because it sits on the bidder's side: N7.b
  forbids deriving the CLEARED price from a cleared yield, not stating a reservation as a price.
- **CORPORATE BONDS ✅** (§9.13-CREDIT row 1). `07b` clears a price per TRANCHE, deposits it in
  `engine2/prices.ts`, and every spread in the model is read back off it — there is no issuer spread
  left to derive a price from.
- **LOANS ✅** (§9.13-CREDIT row 3). `07d` clears a price per loan and `pricePar` — the price
  linearised out of a cleared discount margin, the forbidden direction, on the surface through the
  loan index and the player's book — is deleted with `pricing.ts:priceLeveragedLoan`.
- **COMMERCIAL PAPER ✅** (§9.13-CREDIT row 4), the last book on either side that derived a price
  from a cleared level. `07f` prices one instrument per piece of paper and states each buyer's
  reservation YIELD as the price it implies over that paper's own remaining life — the permitted
  direction, on the bidder's side, exactly as the sovereign does. What proves N7.b rather than
  merely asserting it is that `credit-price.ts:trancheClearedPricePerFace` now contains no
  arithmetic at all: it is a lookup of what somebody paid, and there is no branch left for paper
  whose price has to be made up.

### ✅ N8 · sov — A HOLDER OF RECORD OF WHAT? (closed, 13-SOV row 3)

**KNOWN(13-SOV, row 3.)** `banking.ts:129`'s `sovereignBondHoldingsByBond: Record<string, number>`
was dollars against a tenor key. There was no instrument in it, so N8's question ("who owns how
many units") could not be asked: a bank owned `t10: 4.2e9` and no bond, and `11-fiscal` redeemed a
maturing tranche by shrinking every holder's bucket pro-rata because there was no way to find who
held the bond that matured. **§3.13-SOV row 3 closed all of it**: every store keys by the tranche
id, `audit/ownership.ts:o11` refuses a position naming an id no ladder carries, and `o3` no longer
exempts sovereigns from the check that a register row names a live instrument.

### ❌ N12 / N13 · sov — THE SOVEREIGN CANNOT FAIL, AND NOTHING SAYS SO

There is no sovereign default path anywhere: no missed-payment test, no exchange, no exclusion.
The contract requires N13 to be answered **even when the answer is "nothing seizable"**, and that is
precisely the difference between a stated answer and an absence. Today it is an absence: a treasury
that runs out of money draws its central-bank overdraft (`accounts.ts:waysAndMeansOf`), so the
question never arises. **§3 step 37-OVERDRAFT**, small on its own and properly folded into the treasury
tree's overdraft finding — until the overdraft goes, a sovereign default has nothing to be triggered
by. It is `sovereign-credit.md` branch G's whole finding, and it is stated here because the contract
is where the two types are meant to differ and this is the row where the difference was never
written down at all.

**A tap, not a new facility (2026-09-05, §9.16-i/ii).** An issuer that wants more of the same
debt REOPENS a tranche it has: `tranche-ledger.ts:tapTranche` adds face to the existing row by
wire to its holder at the tap price and touches no term; a corporate deal names the printed
senior bond nearest the standard tenor (`primary-market.ts:tapTargetOf`), 07b offers the added
face beside that bond's outstanding stock in one solve at its price, and stage 08 taps the row
with what was placed — the sovereign primary had always worked this way (its unheld face is
offered on the bond itself). A revolver is one line per borrower and bank, tapped by every draw
(`drawRevolver`). A debut, or an issuer with no printed bond near the tenor, still opens a fresh
tranche.

### ✅ N14 BOTH TYPES — THE NAME IS THE ONE A MARKET WOULD USE

Closed 2026-09-05 (§9.14). `domain/instruments.ts:instrumentDisplayName` is the one grammar —
`KRLN 4.75% 2031`, `KRLN L+350 2029` (a bank facility is a loan), `USA 3M bill`, `KRLN 3M CP`,
`USA 4.75% 2031` — and `engine/instrument-name.ts:instrumentNameOf` is the one read of the store
that feeds it (the row, the issuer's ticker or region, bill-or-bond). The tranche object, the
ladder, every holders and desk list (`book.tsx:instrumentName`) and the desk and paydown traces
name paper through it; the internal id is shown once, as "id", on the tranche. The year is the
caller's calendar, because the UI's and the engine's still differ by one (§3.15).

### ⚠️ N3 BOTH TYPES — NO INSTRUMENT CARRIES ITS OWN CURRENCY

**KNOWN(13c.)** Neither `DebtTranche` nor `GovDebtTranche` has a currency field. Every payment they
generate reads its money off the OWNER — `accounts.ts:obligationCurrencyOf` for a coupon,
`currencyOf(regionId)` for a sovereign one. That is right for a purely domestic issuer and has no
answer at all for a cross-border issue, which is the case N3 exists to cover. 13c's own bullet names
this class ("the contracts with no denomination"); the two bond types belong on that list.

### ⚠️ N5 / N6 · sov — TWO INSTRUMENTS EXPRESSED AS A TENOR TEST

A bill and a bond are different instruments (`sovereign-credit.md` B1), and here they are one type
separated by `isDiscountBill(t.tenorAtIssuanceYears) → tenor < 1.5`. Everything downstream then
carries the test: `weeklyInterestExpenseLocal` filters bills out, `sovereignCouponByBond` filters
them out, `bill-accretion.ts` exists to give them the return the coupon path does not. N6 · sov is
the same shape one level down — `sovereignCouponDueShare` hard-codes `PAYMENTS_PER_YEAR = 2` for
every bond (it now counts the payment week from the bond's own issue date), and each holder accrues
at the bucket's PRINCIPAL-WEIGHTED AVERAGE coupon rather than at its own bond's. Rule 9 says the
periodicity is part of the number; here it is part of the bucket. Folds into **§3 step 13-SOV**,
whose conversion deletes the bucket and makes the bill a `DebtTranche` with `N5.c` in its own row.

### ⚠️ N9.b · corp — THE ACCRUAL FOLLOWS THE HOLDER, NOT THE PAPER

Both types run the same mechanism and it is better than the contract feared: the accrual ledger
accumulates per (instrument, holder) and the coupon date pays every accrued balance, **including a
holder that has since sold** (`shared-helpers.ts:applyHolderInterestAccruals`,
`sovereign-calendar.ts:runSovereignCalendarStage`). So the coupon is not a windfall to whoever holds
it on the date.

**The sovereign now settles the leg** (`book-settlement.ts:accruedOnFills`, step 13b): a bond's
price is CLEAN, the buyer pays the accrued on the face it took, the accrual ledger re-keys by the
same amount, and the net — the accrued on seasoned paper the primary placed — goes to the treasury,
whose receivable rose with it. The apportionment is still weekly rather than daily, which is the
model's clock everywhere.

**The corporate books have it too** (§9.13-CREDIT rows 1–4). The reason they could not before was
never this node: `07b` cleared one instrument per COMPANY while the accrual ledger is keyed per
TRANCHE, so there was no face delta on a tranche to carry an accrued. Row 1 made the bond clear
name the paper and row 2 settled the leg (`moveCorporateAccrued`); rows 3 and 4 did the same for
the loans and the paper. Still ⚠️ for one reason: the apportionment is weekly rather than daily,
which is the model's clock everywhere.

### ⚠️ N13.a · corp — A RANKING THAT NOTHING EVER RANKS

**Already §3 step 33**, and see `corporate-credit.md` §3 for the sharper form: the estate ranks by
instrument TYPE and never reads `DebtTranche.seniority`, AND no creation site anywhere ever writes
`'SUBORDINATED'`, so the field is a constant and `TR_SUBORDINATED` is a flag bit that is never set.
The sovereign's ✅ on the same node is the contrast the contract was written to make visible: the
sovereign is pari passu because it has no seniority field, which is correct; the corporate has a
seniority field with one value, which is not.

### PRESENT AND NOT WORTH RE-CHECKING

N1, N4, N9 and N9.a are ✅ for both types with nothing to say: a named issuer with a balance sheet,
a real maturity week, real transferability, and a two-legged settlement that nets to zero through
one clearing house. N11/N11.a/N13.a are the three rows where the two types answer DIFFERENTLY and
both answers are right — which is the evidence that splitting this contract out was the correct
call, and the model already has the shape 13-SOV is meant to converge on.

### Also marked, briefly

- **N5.b · corp ⚠️** — a floater's margin resets against the POSTED policy rate, not a transacted reference (`../systems/indices.md` D3, 37-BENCHMARK).
- **N5.c · corp ⚠️** — commercial paper is issued at par with a coupon rather than at a discount (`../systems/short-term-debt.md` A1.a).
