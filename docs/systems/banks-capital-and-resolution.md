# SYSTEM: BANKS — CAPITAL AND RESOLUTION

What absorbs a bank's losses, how much of it there must be, and what happens when it runs out.
The third reading of the same balance sheet: `banks-lending.md` is its assets,
`banks-funding-and-liquidity.md` its liabilities, this is the residual and its consequences.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT CAPITAL IS
- **A1** REASON — capital is the **residual**: assets minus liabilities. It is not a fund
  - A1.a FORBID — capital is never a pot that is spent. It is what is left, and it falls when a
    loss is booked because the asset fell, not because something was withdrawn
- **A2** REASON — it is **layered**, and the layers absorb in order
  - A2.a **equity** absorbs first and fully
  - A2.b **subordinated debt** absorbs next, and its holders are creditors who took that risk
  - A2.c **senior creditors and depositors** last, and only in resolution
- **A3** REASON — it **grows** by retained earnings and by issuance, and both are decisions
- **A4** REASON — it **falls** by losses and by distributions (dividends, buybacks), and both are
  events with dates

### B. HOW MUCH THERE MUST BE
- **B1** REASON — a **requirement**, expressed against risk-weighted assets
  - B1.a **risk weights differ by asset**, and that is why a bank prefers some assets to others
  - B1.b a **leverage** constraint that does not use weights, as a backstop to B1.a
  - B1.c VERIFY — which binds is an outcome and differs by bank
- **B2** REASON — a **buffer above the requirement** the bank chooses, because hitting the
  requirement has consequences
- **B3** REASON — breaching it triggers **consequences before failure**: distributions restricted,
  a plan demanded, supervision intensified
  - B3.a VERIFY — a bank near the line behaves differently. If it does not, the requirement is
    decorative

### C. WHEN IT RUNS OUT
- **C1** REASON — **insolvency** is assets < liabilities, and it is distinct from illiquidity
  (`banks-funding-and-liquidity.md` D6)
  - C1.a a bank can be **solvent and illiquid**, or **insolvent and liquid**, and the two failures
    have different triggers and different remedies
- **C2** REASON — **recapitalisation** first, if somebody will provide it
  - C2.a existing holders diluted, new money priced by whoever provides it
  - C2.b it can **fail** — nobody has to buy
- **C3** REASON — **RESOLUTION**: the bank stops being a going concern
  - C3.a a **trigger** somebody applies, on an observable
  - C3.b it is not the same as bankruptcy: deposits keep working

### D. THE RESOLUTION ITSELF
- **D1** REASON — a **valuation**: what the assets are actually worth, not their book
  - D1.a and the hole is the difference
- **D2** REASON — **the hierarchy is respected**: equity wiped, then A2.b bailed in, then the rest
  - D2.a VERIFY — no creditor is worse off than in a liquidation. That is the constraint the
    whole design serves
- **D3** REASON — an **acquirer** takes the book, or there is none
  - D3.a it takes assets AND liabilities, and pays or is paid the difference
  - D3.b the acquirer is **choosing**, and can decline
- **D4** REASON — **deposit insurance pays** what the estate cannot, up to the limit, and the
  insurer becomes a creditor of the estate
- **D5** REASON — **the public purse is the last resort**, and it is a **fiscal cost with a payer**
  - D5.a which lands in `the-treasury.md`, as real money
- **D6** REASON — the failed bank's **positions do not vanish**: every book it was on has a
  counterparty problem, and that is contagion (`money-market.md` E3)

### E. AFTER
- **E1** REASON — the **estate** is realised over time, and creditors are paid from it
- **E2** REASON — the **surviving system is more concentrated**, and that is a measurable
  consequence
- **E3** VERIFY — the resolution **conserves**: what the acquirer took, what the insurer paid, what
  the estate realised and what holders lost sum to the hole in D1

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 capital is the residual, not a fund | `src/engine/simulation/bank-identity-trace.ts:residualOf` | ✅ |
| A1.a FORBID capital is never a pot that is spent | `src/engine/ledger/bank-book.ts:bookPnL` | ✅ |
| A2 it is layered, and the layers absorb in order | `src/domain/company.ts:seniority` | ⚠️ |
| A2.a equity absorbs first and fully | `src/engine/ledger/bank-transfer.ts:assumeBankBooks` | ✅ |
| **A2.b subordinated debt absorbs next** | — | ❌ |
| A2.c senior creditors and depositors last, only in resolution | `src/domain/bank-resolution.ts:ladderBailedInUSD` | ⚠️ |
| A3 it grows by retained earnings and by issuance | `src/engine/macro/banking.ts:evolveBankingSector` | ⚠️ |
| A4 it falls by losses and by distributions | `src/engine/macro/banking.ts:dividendWeeklyUSD` | ✅ |
| B1 a requirement expressed against risk-weighted assets | `src/domain/bank-pricing.ts:bankRwaUSD` | ✅ |
| B1.a risk weights differ by asset | `src/domain/banking.ts:householdBookRwaUSD` | ✅ |
| B1.b a leverage constraint as a backstop | `src/engine/macro/banking.ts:BASEL_MIN_LEVERAGE_RATIO` | ✅ |
| B1.c VERIFY which binds is an outcome | — | ❌ |
| B2 a buffer above the requirement the bank chooses | `src/domain/bank-pricing.ts:BANK_WORKING_CAPITAL_RATIO` | ⚠️ |
| B3 breaching triggers consequences before failure | `src/engine/macro/banking.ts:targetPayoutRatio` | ✅ |
| B3.a VERIFY a bank near the line behaves differently | `src/engine/simulation/stages/bank-lending.ts:headroomUSD` | ⚠️ |
| **C1 insolvency is assets < liabilities, distinct from illiquidity** | `src/domain/bank-resolution.ts:isBankUnderPca` | ⚠️ |
| **C1.a solvent and illiquid, or insolvent and liquid** | — | ❌ |
| C2 recapitalisation first, if somebody will provide it | `src/engine/simulation/stages/bank-resolution.ts:injectionUSD` | ⚠️ |
| **C2.a existing holders diluted, new money priced** | — | ❌ |
| C2.b it can fail — nobody has to buy | — | ❌ |
| C3 RESOLUTION: the bank stops being a going concern | `src/engine/simulation/stages/bank-resolution.ts:runBankResolutionStage` | ✅ |
| C3.a a trigger somebody applies, on an observable | `src/domain/bank-resolution.ts:PCA_CAPITAL_RATIO` | ✅ |
| C3.b not bankruptcy: deposits keep working | `src/engine/ledger/bank-transfer.ts:absorbBankSheet` | ✅ |
| **D1 a valuation: what the assets are actually worth** | `src/domain/bank-resolution.ts:bankSheetAssetsUSD` | ❌ |
| D1.a and the hole is the difference | `src/domain/bank-resolution.ts:guaranteeUSD` | ⚠️ |
| D2 the hierarchy is respected | `src/domain/bank-resolution.ts:planBankResolution` | ⚠️ |
| D2.a VERIFY no creditor worse off than in liquidation | — | ❌ |
| D3 an acquirer takes the book, or there is none | `src/domain/bank-resolution.ts:chooseAssumingBank` | ✅ |
| D3.a it takes assets AND liabilities, and pays the difference | `src/domain/bank-resolution.ts:estateUSD` | ✅ |
| **D3.b the acquirer is CHOOSING, and can decline** | `src/domain/bank-resolution.ts:chooseAssumingBank` | ❌ |
| D4 deposit insurance pays; the insurer becomes a creditor | `src/engine/simulation/stages/bank-resolution.ts:guaranteeUSD` | ⚠️ |
| D5 the public purse is the last resort, with a payer | `src/engine/simulation/stages/bank-resolution.ts:runBankResolutionStage` | ✅ |
| D5.a which lands in the treasury as real money | `src/engine/ledger/accounts.ts:treasuryNetOf` | ✅ |
| **D6 the failed bank's positions do not vanish — contagion** | `src/engine/simulation/stages/bank-resolution.ts:rekeyBankLinks` | ⚠️ |
| E1 the estate is realised over time | `src/engine/simulation/stages/estate-resolution.ts:runEstateResolutionStage` | ⚠️ |
| E2 the surviving system is more concentrated | `src/engine/simulation/stages/bank-resolution.ts:bankMarketShare` | ✅ |
| E3 VERIFY the resolution conserves | `src/engine/simulation/stages/bank-resolution.ts:sheetLinesUSD` | ✅ |

---

## 3. THE DIFF

### ⚠️ C1 / C1.a — THE ONLY WAY TO FAIL IS CAPITAL, AND THE TEST IS A BOOK RATIO. KNOWN(20-LLR)

`isBankUnderPca` is `sheet.bankEquityUSD < bankRwaUSD(sheet) * PCA_CAPITAL_RATIO` (2%), and
`bank-resolution.ts:116` is the only caller that closes a bank. So:

- **the trigger is not C1's test.** C1 says insolvency is assets < liabilities. This is book equity
  against RISK-WEIGHTED assets, which is a regulatory ratio — a sovereign book is weight ZERO
  (`macro/banking.ts:463`: `sovereignUSD * 0.0`), so a bank whose entire balance sheet is
  government bonds has `rwaUSD ≈ 0` and falls into `isBankUnderPca`'s second branch,
  `bankEquityUSD < 0`. Its equity has to go outright negative before anything happens.
- **there is no other trigger at all.** C1.a's two-by-two — solvent/illiquid and insolvent/liquid —
  has only one live cell, and 20-LLR states the count: "the overwhelming majority of bank failures
  are funding events" and the model has none.

**Already §3 step 20-LLR** (second of its three compounding failures). Its resolution is a
*liquidity* trigger, which cannot be written until the funding shortfall is real — i.e. after
20-LLR's ordering fix. C1's own defect (book RWA standing in for a valuation) is separate and joins
D1 below.

### ❌ D1 / D2.a — THERE IS NO VALUATION, SO THERE IS NO HOLE. NEW

`planBankResolution` computes `netBookUSD = bankSheetAssetsUSD(...) - bankAssumedLiabilitiesUSD(...)
- centralBankLoanUSD` — every asset at **book**: `loanBooksOf` is Σ principal, the sovereign book is
its carried tenor amounts, the desks at inventory. Nothing is marked, nothing is discounted for a
forced sale, no distressed bid is taken.

So what the code calls the hole is not D1.a's hole. `guaranteeUSD = max(0, acquirerCapitalUSD -
netBookUSD)` — the shortfall of the book's net against **the regulatory capital the acquirer needs
to carry it** (`bankRwaUSD × 0.11`). A bank whose loans are worth 70 cents resolves with
`guaranteeUSD = 0` as long as its book equity clears 11% of RWA, and a perfectly solvent bank
generates a "guarantee" payment merely because its book is large. The public cost is therefore
uncorrelated with the loss, and D2.a (no creditor worse off than in liquidation) has no liquidation
value to be compared against — it cannot even be stated.

Consequence: resolution moves the right money between the right parties and conveys **no
information about how bad the failure was.** Every loss the tree can produce has already been taken
week by week through `bookPnL` before the bank closes (see `banks-lending.md` E1), so by the time
the resolution runs there is nothing left to discover. **Becomes a §3 step**, medium: it needs a
mark on the failed book — the sovereign and desk lines already have cleared prices, and the loan
book needs the `banks-lending.md` E1 event before "worth less than book" means anything. Sequence
after that.

### ❌ D3.b — THE ACQUIRER IS ASSIGNED, NOT CHOOSING. NEW

`chooseAssumingBank` takes the largest equity among peers that clear the floor, and failing that
the largest that is not itself under PCA. It never consults the deal: not `netBookUSD`, not the
capital it will have to find, not what the book is worth to it. It cannot decline. `bank-resolution.ts:127`
handles "no candidate" only as *no peer exists* — and then the treasury recapitalises the failing
bank in place, with the code's own comment recording that "the shareholders are not diluted here
… which overstates what they keep".

This is the same defect the atlas found in the treasury's D5.a and the auction books' OWN7: a
residual party that absorbs by construction. A bank that must take the books whatever they contain
is a forced buyer, and it is the reason `guaranteeUSD`'s size never has to be negotiated. **Becomes
a §3 step**, small: the acquirer bids (its bid IS `estateUSD`, which already exists), and a
resolution with no bid falls through to the public path that already exists beside it.

### ❌ A2.b / A2.c / C2 — NO BAIL-IN LAYER, AND NO PRIVATE RECAPITALISATION

`seniority` is `'SENIOR' | 'SUBORDINATED'` and the type is honoured throughout the corporate ladder
(`audit/prices.ts:33` even asserts subordinated trades wider) — but **no bank issues a subordinated
tranche**, so A2.b's layer is empty and the ladder that gets bailed in
(`ladderBailedInUSD`) is a bank's SENIOR paper, which A2.c puts at the back with depositors. The
order the code executes is therefore: equity → senior bonds → the public purse, with depositors
never touched — one layer short at the top and one layer over-punished in the middle.

C2 is worse: there is no private recapitalisation path at all. `evolveBankingSector` records that
the old equity-rescale write was deleted and that a bank "stays undercapitalized until a real equity
raise exists"; `stage08-back.ts` runs the financing decision for every firm and no bank equity issue
comes out of it. So C2, C2.a and C2.b — recap first, priced by whoever provides it, and able to fail
— have no representation, and a bank goes from breach straight to closure. **Becomes a §3 step**,
and it is the same step as `banks-funding-and-liquidity.md` A3: give a bank a capital raise and both
close.

### ⚠️ D6 — CONTAGION IS PREVENTED BY CONSTRUCTION

`rekeyBankLinks` re-points every link in the world from the failed ticker to the acquirer: house
banks, repo contracts on both sides, prime-brokerage lines, facility lenders, derivative parties,
accrued-coupon rows, consignments. Nothing is lost, nobody is left with a claim on a counterparty
that no longer exists, and the acquirer takes the central-bank loan whole ("the central bank is
never haircut"). That is a legitimate description of a *clean* purchase-and-assumption — but D6's
requirement is that "every book it was on has a counterparty problem", and here no book ever does.
Combined with D3.b (an acquirer that cannot decline), a failure has no transmission channel: it is
absorbed silently by the strongest peer in the same week it happens.

The path the money market's E3 needs is exactly this one, inverted — when there IS no acquirer, or
when the acquirer declines, the failed bank's lenders should take a loss by name. Sequence after
D3.b; **becomes a §3 step** with it.

### ⚠️ B2 / A3 — THE BUFFER AND THE CAPITAL SUPPLY ARE BOTH CONSTANTS

B2 asks for a buffer the bank chooses. `BANK_WORKING_CAPITAL_RATIO = 0.11` is one number for every
bank in every region and every week — used to price the capital charge in `quoteLoanMarginBps`, to
size `assumingCapitalUSD` in resolution, and as the payout threshold. The dividend policy is a
three-branch ladder on the SAME prior ratio (`>0.14 → 90%`, `<0.11 → 5%`, else 40%), which is the
B3 consequence and is genuinely present, so what is missing is only the *choice*: a bank cannot run
a thicker buffer because it is riskier. Its natural owner is §3 step 30 (the stated-number registry)
or 20d (management decides).

A3's issuance half is `❌` and is stated on the C2 row above.

### ⚠️ D4 / E1 — THE INSURER PAYS AND WALKS AWAY

The guarantee is paid GOVERNMENT → the acquirer (`bank-resolution.ts:191`) and the treasury acquires
nothing for it: no claim on the estate is created, so the recovery that would normally come back to
the insurer is lost, and the fiscal cost is final on the day. E1's estate is real for the shell's own
bondholders and shareholders (`estateUSD` is paid to the receivership and
`runEstateResolutionStage` works it out), but the public claim never joins that queue. Small, and it
belongs with D1 — the estate's realisation is only meaningful once the book had a value to be
realised against.

### A measurement, for §3 step 38: B1.c, B3.a, D2.a

B1.c (which of the risk-weighted and leverage constraints binds) is computable today — both
`headroomUSD` expressions exist side by side in `bank-lending.ts` and `leverageHeadroomUSD` in
`macro/banking.ts` — and nothing records which one bound. B3.a would be visible in the payout
ladder's branches. D2.a cannot be measured until D1 exists. The first two are standing reads.
