# SYSTEM: PRIVATE EQUITY

Buying whole firms with borrowed money, holding them unlisted, and selling them later. It belongs
in this world because it is the demand side of `corporate-credit.md`'s leveraged loan, the buyer
in `m-and-a.md`, and the one owner type whose horizon is years rather than weeks.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. THE STRUCTURE
- **A1** REASON — a **fund** with committed capital from named investors
  (`insurers-and-pensions.md` C, `households.md` D1)
- **A2** REASON — capital is **committed, not paid**: it is **called** when a deal needs it, and
  the call is a real payment from the investor's account on a date it cannot refuse
  - A2.a so an investor must hold liquidity against calls it did not choose the timing of, and in
    a stress the calls and its own troubles arrive together
- **A3** REASON — a **manager** earning a fee on committed capital and a share of the gains
- **A4** REASON — the fund has a **life**: it invests, it holds, it exits, it winds up
- **A5** REASON — the acquired firms are **held in named vehicles**, and each is a party with its
  own balance sheet (`firm-fundamentals.md`)

### B. THE BUYOUT
- **B1** REASON — it buys a firm at a **price**, agreed with the sellers (`m-and-a.md`)
- **B2** REASON — most of the price is **debt raised against the target itself**
  (`corporate-credit.md`, `banks-lending.md`)
  - B2.a the debt is the **target's** liability, not the fund's — which is why a failed buyout
    kills the firm and not the fund
  - B2.b so the deal only happens if lenders will lend, at a price: **the credit market decides
    which buyouts occur**, and that is a real constraint, not a rate applied to a plan
- **B3** REASON — the **equity cheque is the rest**, funded by A2
- **B4** REASON — the target's balance sheet is **transformed at the moment of purchase**:
  leverage up, interest cost up, ownership changed in the register (`the-register.md` C)
- **B5** VERIFY — the sources and uses of a deal must balance exactly, and the money must come out
  of named accounts

### C. THE HOLD
- **C1** REASON — the firm **operates and services its debt** out of cash flow
  (`firm-fundamentals.md` D), and the higher leverage means less room
- **C2** REASON — the owner **influences the firm**: investment, costs, dividends
  (`the-capital-programme.md`)
- **C3** REASON — it can **recapitalise**: raise more debt to pay itself a dividend, which is a
  real transfer from the firm's future to the owner's present
- **C4** REASON — it can **fail**: the leverage in B2 makes default a real outcome, and the loss
  falls on the lenders (`corporate-credit.md`) and wipes the equity
- **C5** REASON — the holding has a **value that is not a market price**: no clearing, so it is a
  mark
  - C5.a FORBID — **an unlisted mark is not a cleared price**, and it must never be treated as one
    by the holder's own accounts (rule 3's boundary: the honest answer is "marked, not cleared")

### D. THE EXIT
- **D1** REASON — it **sells**: to another fund, to a corporate buyer (`m-and-a.md`), or to the
  public market (`equity.md`)
- **D2** REASON — the exit produces a **cleared price**, which is the first real price the holding
  has had (C5.a)
- **D3** REASON — proceeds are **distributed to the investors**, in cash, into their accounts
- **D4** REASON — the exit **depends on the market being open**: in a bad market it does not
  happen, the hold extends, and the distributions do not arrive
  - D4.a which feeds back to A2.a — investors owe calls and are not receiving distributions at the
    same time
- **D5** VERIFY — the fund's returns are a read of D3 against A2, and both are actual cash

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no buyout without a lender who agreed to lend** (B2.b)
- **E2** FORBID — **no capital call that is not paid from a real balance**
- **E3** FORBID — **no exit at a price nobody paid** (D2)

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a fund with committed capital from named investors | `src/domain/institutions.ts:lpCommitments` | ✅ |
| **A2 capital is CALLED — a real payment the investor cannot refuse** | `src/engine/simulation/stages/pe-lifecycle.ts:callCapitalLocal` | ⚠️ |
| **A2.a the investor must hold liquidity against calls it did not time** | — | ❌ |
| **A3 a manager on a fee and a share of the gains** | — | ❌ |
| A4 the fund has a life: invest, hold, exit, wind up | `src/engine/simulation/stages/pe-lifecycle.ts:PE_FUND_LIFE_WEEKS` | ⚠️ |
| A5 the firms are held in named vehicles with their own sheets | `src/engine/simulation/stages/pe-lifecycle.ts:portfolioCompanyIds` | ✅ |
| B1 it buys at a price agreed with the sellers | `src/engine/simulation/stages/pe-lifecycle.ts:equityValueLocal` | ⚠️ |
| B2 most of the price is debt raised against the target | `src/engine/simulation/stages/pe-lifecycle.ts:debtLocal` | ✅ |
| B2.a the debt is the TARGET's liability, not the fund's | `src/engine/ledger/tranche-ledger.ts:issueTranche` | ✅ |
| B2.b the credit market decides which buyouts occur | `src/engine/simulation/stages/07d-leveraged-loan-clearing.ts:runLeveragedLoanClearingStage` | ✅ |
| B3 the equity cheque is the rest, funded by A2 | `src/engine/simulation/stages/pe-lifecycle.ts:equityLocal` | ✅ |
| B4 the target's sheet is transformed at the moment of purchase | `src/engine/simulation/stages/pe-lifecycle.ts:entryEvMultiple` | ✅ |
| **B5 VERIFY sources and uses balance, out of named accounts** | `src/engine/simulation/stages/settlement.ts:pay` | ⚠️ |
| C1 the firm operates and services its debt out of cash flow | `src/engine2/stage08-back.ts:annualInterest` | ✅ |
| **C2 the owner influences the firm** | — | ❌ |
| C3 it can recapitalise: debt raised to pay a dividend | `src/engine/simulation/stages/pe-lifecycle.ts:RECAP_DM_THRESHOLD_BPS` | ✅ |
| C4 it can fail; the loss falls on lenders and wipes the equity | `src/engine/simulation/stages/pe-lifecycle.ts:defaultedIds` | ✅ |
| C5 the holding has a value that is not a market price | `src/engine/simulation/stages/institutional-balance-sheet.ts:sponsorPortfolioLocal` | ✅ |
| **C5.a FORBID an unlisted mark must not be treated as a cleared price** | `src/engine/simulation/stages/institutional-balance-sheet.ts:sponsorPortfolioLocal` | ❌ |
| D1 it sells: to a sponsor, a corporate, or the public market | `src/engine/simulation/stages/pe-lifecycle.ts:saleCandidate` | ⚠️ |
| D2 the exit produces a cleared price — the first real one | `src/engine/simulation/stages/pe-lifecycle.ts:markEvMultiple` | ⚠️ |
| D3 proceeds are distributed to the investors, in cash | `src/engine/simulation/stages/pe-lifecycle.ts:distributeToLps` | ✅ |
| D4 the exit depends on the market being open | `src/engine/simulation/stages/pe-lifecycle.ts:IPO_PREMIUM_OVER_ENTRY` | ✅ |
| D4.a which feeds back to A2.a | — | ❌ |
| D5 VERIFY returns are a read of D3 against A2, both actual cash | `src/engine/simulation/initialization.ts:PE_FUND_INTEREST` | ❌ |
| E1 FORBID no buyout without a lender who agreed to lend | `src/engine/simulation/stages/pe-lifecycle.ts:failed` | ✅ |
| E2 FORBID no capital call not paid from a real balance | `src/domain/fund.ts:distributable` | ✅ |
| E3 FORBID no exit at a price nobody paid | `src/engine/simulation/stages/pe-lifecycle.ts:saleCandidate` | ✅ |

Counts: 16 `✅` · 6 `⚠️` · 6 `❌`.

---

## 3. THE DIFF

### ❌ C5.a — THE UNLISTED MARK IS THE SPONSOR'S BALANCE SHEET

The FORBID node, and it is violated by the sponsor's total-assets read itself.
`institutional-balance-sheet.ts:186-190`:

    return a + Math.max(0, evMultiple * c.ebitda - ladderTotalUSD(v2, c.id)) * (c.ownership?.peSponsorPct ?? 0);

and `institutionTotalAssetsUSD:195-198` substitutes exactly that for a `PRIVATE_EQUITY` entity's book.
So a model mark — the median listed `(marketCap + debt) / EBITDA` in the region, times this
private firm's EBITDA, less its ladder — **is** the sponsor's assets, and everything downstream
treats it as one: `entityRequiredReturn(entity, totalAssetsUSD)`, the sleeve target in
`availablePurchaseCapacityUSD`, the money-fund fee split, the UI's equity ratio, and — through
`comparableMultiple` — the price of the next buyout. The honest answer C5.a asks for is
*"marked, not cleared"*, and there is nowhere in the model to say it: a position is a value, and a
value does not carry the fact that nobody paid it.

`publicComparableEvMultiple` is a careful function and its header argues the case well (a fixed 8x
made the private sector's value independent of the market it lives in). The problem is not the
multiple; it is that its output has the same TYPE as a cleared price and is used in the same
places. That is the same defect §3 step 13 names for cost-carried inventory — *"an asset genuinely
not traded is carried at COST, and carried at cost is a DECLARED property in the asset
registry"* — one class over. **Becomes a §3 step, and it should be folded into step 13**: the
declared property step 13 already requires is exactly the one this node needs, and doing it twice
would produce two ways of saying "not a price".

The same mark also settles D2. A sponsor-to-sponsor sale prices at `markEvMultiple` — the seller
does not negotiate and the buyer does not bid; the price IS the mark. Only the IPO produces a
genuinely cleared exit price (07e's book, with a real `walkAwayStat`). E3 still holds, because the
buyer really does pay the mark out of a real called balance, so somebody paid it — but D2's *"the
first real price the holding has had"* only happens on the listing route.

### ⚠️ A2 / ❌ A2.a — A CALL THE INVESTOR CAN REFUSE BY BEING SHORT OF CASH

`callCapitalUSD:159-165` bounds each LP's contribution by
`min(committed − drawn, max(0, cash + pendingSettlement))`, and `settlePeLifecycleDeals:580`
abandons the deal when `calledUSD < equityUSD * 0.999` (returning what was raised). The file's own
comment states the doctrine: *"a call that comes up short is a deal that does not close."*

For the FUND that is right. For the INVESTOR it inverts A2. A commitment is supposed to be an
unconditional obligation to pay on a date the LP did not choose — which is the whole reason A2.a
exists (an insurer or pension has to hold liquidity against it, and in a stress the call and its
own troubles arrive together). Here the LP is never obliged: it pays what it happens to have, and
if it has nothing it pays nothing and suffers nothing. No LP ever sells an asset to meet a call,
no LP ever defaults on a commitment, and the liquidity drag A2.a describes — the one real cost of
being an LP — does not exist. `dryPowderUSD` embeds the same assumption on the other side: the
fund's dry powder is `min(undrawn, LP cash)`, so a fund's capacity to act is its investors' spare
change rather than their promise.

**Becomes a §3 step**, medium: the call is a payment the LP must fund, which means it draws the
LP's own liquidity ladder (sell the sleeve, then the book — the same ladder
`etf-flows.ts` already gives households) and, failing that, an LP default with a real consequence.
It also closes D4.a, which is the same fact seen from the exit side: today distributions and calls
never collide, because calls simply do not arrive when there is no cash.

### ⚠️ B5 — THE SELLERS ARE PAID THE EQUITY CHEQUE AND THE TARGET KEEPS THE DEBT

Sources and uses do not balance, and the gap is the size of the loan. Trace an LBO
(`settlePeLifecycleDeals:573-612`):

- **Uses**: `priceUSD = equityValueUSD(target, markEvMultiple)` — the whole equity value of the
  firm being bought.
- **Sources**: `debtUSD` raised on the TARGET (a real 07d primary; proceeds are paid to the
  ISSUER by `settlePricedOfferings`, i.e. to the company itself) plus `equityUSD = priceUSD −
  debtUSD` called from the LPs.
- **The payment to the sellers**: `pay(sponsor → HOUSEHOLD, calledUSD)` — the equity cheque only.

So the founding households sell a company worth `priceUSD` and receive `priceUSD − debtUSD`,
while the target ends the week holding `debtUSD` of cash it did not have and did not need. In a
real buyout the new debt is raised BY the target and paid THROUGH to the sellers; here it stops at
the target. The sponsor gets 95% of a firm that is both levered and over-capitalised by the same
number, the sellers are underpaid by it, and household net worth is credited only the equity slice
(`sellerRegion.householdState.netWorthUSD += calledUSD`).

**Becomes a §3 step**, small and mechanical: the LBO's debt proceeds are a payment from the target
to the sellers on the settlement date. It moves real money in every deal, so it is not
byte-identical — which is the right kind of change.

### ❌ A3 — THERE IS NO PE MANAGER, NO FEE AND NO CARRY

`peFund` carries `portfolioCompanyIds` and `lpCommitments` and nothing else. There is no
management fee on committed capital, no carried interest on the gains, and no manager entity
distinct from the fund: `PRIVATE_EQUITY` has `beneficiariesAreHouseholds: false` and
`liabilityHurdle: undefined`, so nobody is paid for running it and the entire gain accrues to the
LPs' `drawnUSD` reduction. Two consequences worth naming: `distributeToLps` returns 100% of exit
proceeds, so the fund's incentive is symmetric where a real sponsor's is not; and a fee on
COMMITTED capital is the reason real funds call capital at all rather than sitting on it, which is
one of A2's motives. **Becomes a §3 step**, small — and it is the same step as `hedge-funds.md`
A3's missing performance fee, because both are the asymmetric-incentive half of a manager
contract.

### ❌ D5 / ⚠️ A4 — THE LP'S CLAIM IS FROZEN AT THE SEED, AND THE FUND NEVER WINDS UP

**D5**: an LP's holding of the fund is a `PE_FUND_INTEREST` register row, written ONCE at
`initialization.ts:1507` and never again. `callCapitalUSD` moves cash and increments `drawnUSD`;
`distributeToLps` moves cash and decrements it; **neither touches the row.** So the register says
an LP owns a fixed dollar interest in a fund whose size, drawn capital and portfolio have all
moved, and `ownership.ts:99` explicitly skips `PE_FUND_INTEREST` from every ownership sum, so
nothing can catch the drift. The node's read — returns as D3's cash against A2's cash — has no
denominator anybody maintains. **Becomes a §3 step** (the row follows the commitment), and the
measurement itself is **for §3 step 38**.

**A4**: `PE_FUND_LIFE_WEEKS = 10 * 52` is real and does force sponsor-to-sponsor sales — but it
is measured per COMPANY (`nextWeek - c.ownership.acquiredWeek >= PE_FUND_LIFE_WEEKS`), not per
fund. The fund itself has no vintage, no term and no wind-up: it never returns its last capital
and closes. So the "life" is a holding-period rule wearing a fund term's name, and A4's fourth
verb — *winds up* — has no code.

### ❌ C2 — THE OWNER DOES NOT INFLUENCE THE FIRM

A portfolio company's investment, costs and dividends are decided by the same
`stage08-back.ts`/`management-review.ts` machinery as any other firm; nothing reads
`ownership.peSponsorId` when those decisions are taken. The sponsor buys the company, levers it
and marks it, and then owns a firm that behaves exactly as it did before. The one real
owner action is C3's recap, which is the sponsor extracting cash rather than running the business.
`the-capital-programme.md`, which this node cites, is where the hook belongs. **Becomes a §3
step**, and its size depends entirely on that tree — recorded here as the demand for it.

### ⚠️ B1 / D1 — REAL DEALS, BUT THE SELLER NEVER SAYS NO

Both the LBO and the sponsor-to-sponsor sale price at `markEvMultiple` and complete whenever the
buyer can fund them. The private seller has no reservation: `runPeLifecycleForRegion` picks a
`target` matching a leverage and EBITDA filter and buys it; the founding households are paid and
are never asked. That is `m-and-a.md`'s subject as much as this one's, and it is the reason B1's
"agreed with the sellers" is ⚠️ — the price is real and the money is real, but only one side of
the negotiation exists. Recorded rather than made a step here, because a private firm's owners
are the household sector and giving them a reservation price is that tree's design question.
