# SYSTEM: SECURITIES LENDING

Lending a security against collateral. It is how a short position becomes deliverable, how a
long-only holder earns an extra basis point, and half of how repo works. The distinguishing
feature: **ownership moves but the economics do not.**

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. THE TRANSACTION
- **A1** REASON — the **lender delivers the security** and the borrower delivers **collateral**
  — cash or other securities — and both legs move in the register and the accounts
- **A2** REASON — **legal title passes.** The borrower can sell what it borrowed; that is the
  entire point
- **A3** REASON — the **economics stay with the lender**: it receives a manufactured payment equal
  to any coupon or dividend, so its cash flows are unchanged (`the-register.md` E1 pays the
  registered holder, and the borrower passes it on)
- **A4** REASON — it is **recallable and it terminates**: the security comes back, the collateral
  goes back
- **A5** REASON — the borrower pays a **fee**, and the fee is a price
  - A5.a it clears (rule 1): scarce paper is expensive to borrow, abundant paper is cheap
  - A5.b when the collateral is cash, the price is expressed as a **rebate** on that cash instead,
    and the two forms are the same number seen from two sides (rule 3)

### B. WHY EACH SIDE IS THERE
- **B1** REASON — the **borrower needs the security**: to deliver a short, to cover a fail, to
  meet a delivery obligation on a derivative
- **B2** REASON — the **lender has it sitting there** and wants the fee: a fund, an insurer, a
  pension (`insurers-and-pensions.md`, `fund-shares.md`)
  - B2.a and it lends only within a mandate, against acceptable collateral, with a limit
- **B3** REASON — an **agent** may sit in the middle and take part of the fee
- **B4** VERIFY — the size of the lendable pool is a read of who actually holds the security and
  is willing; it caps how large a short can get, which is a real constraint

### C. COLLATERAL AND MARGIN
- **C1** REASON — the collateral is **worth more than the loan** — a haircut — because the lender
  must be able to sell it and be whole
- **C2** REASON — both sides are **marked daily**: when the borrowed security rises, the borrower
  posts more collateral
  - C2.a the margin flow is real money moving between two named parties
- **C3** REASON — **cash collateral is reinvested** by the lender, and that reinvestment is a
  position with its own risk — this is where a lending programme actually loses money
- **C4** FORBID — **no collateral that is not held.** Posted collateral leaves the poster's free
  balance; it cannot be counted as available by both sides (rule 3)
- **C5** REASON — **rehypothecation**, where permitted, means the same security backs a chain of
  obligations — and the chain must be **traceable**, because it is how a single default reaches
  parties that never traded with the defaulter

### D. FAILURE
- **D1** REASON — the borrower can **fail to return**, and then the lender keeps the collateral
  and buys the security back in the market, at whatever it costs
- **D2** REASON — a **squeeze** is possible: shorts must buy, the lendable pool is small, the fee
  and the price both rise
  - D2.a VERIFY — this is a consequence of B4 and C, to be measured, never a scripted event
- **D3** REASON — a **recall** forces the borrower to find the security elsewhere or close its
  short

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no short without a borrow.** A negative position that nobody lent is an
  invented security (`the-register.md` C4)
- **E2** FORBID — **no double-counting the loaned security.** The lender's economic exposure and
  the borrower's legal title are two different reads of ONE security, and Σ holdings must still
  equal issued (`the-register.md` B2)
- **E3** FORBID — **no free borrow.** A fee of zero is a cleared price only if somebody posted it

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 both legs move: the security and the collateral | `src/engine/simulation/stages/securities-lending.ts:deliver` | ✅ |
| A2 legal title passes — the borrower can sell it | `src/engine/simulation/stages/securities-lending.ts:runSecuritiesLendingStage` | ✅ |
| **A3 the economics stay with the lender (a manufactured payment)** | — | ❌ |
| A4 recallable, and it terminates | `src/domain/securities-lending.ts:recalledWeek` | ✅ |
| A5 the borrower pays a fee, and the fee is a price | `src/domain/securities-lending.ts:loanWeeklyFeeUSD` | ✅ |
| A5.a it clears: scarce paper is dear | `src/domain/securities-lending.ts:lendingReservationFeeBps` | ✅ |
| **A5.b a rebate when the collateral is cash** | — | ❌ |
| B1 the borrower needs the security | `src/domain/institution-profiles.ts:shortsEquity` | ✅ |
| B2 the lender has it and wants the fee | `src/engine/simulation/stages/securities-lending.ts:participants` | ✅ |
| B2.a within a mandate, against acceptable collateral, with a limit | `src/engine/simulation/stages/securities-lending.ts:maxHoldingUSD` | ⚠️ |
| **B3 an agent may sit in the middle** | — | ❌ |
| B4 VERIFY the lendable pool is a read, and caps the short | `src/engine/simulation/stages/securities-lending.ts:deliverable` | ✅ |
| **C1 the collateral is worth MORE than the loan — a haircut** | `src/engine/simulation/stages/securities-lending.ts:collateralUSD` | ⚠️ |
| C2 both sides marked, and the difference is posted | `src/engine/simulation/stages/securities-lending.ts:marginCallUSD` | ✅ |
| C2.a the margin flow is real money between named parties | `src/engine/simulation/stages/settlement.ts:pay` | ✅ |
| C3 cash collateral is reinvested, and that is a position | `src/engine/simulation/stages/repo-clearing.ts:CASH_SLEEVE_OVERNIGHT_SHARE` | ⚠️ |
| C4 FORBID no collateral that is not held | `src/engine/simulation/stages/settlement.ts:pay` | ✅ |
| **C5 rehypothecation, and the chain must be traceable** | — | ❌ |
| D1 the borrower can fail to return; the lender keeps the collateral | `src/engine/simulation/stages/securities-lending.ts:buyInSharesByBorrower` | ⚠️ |
| D2 a squeeze is possible | `src/engine/simulation/stages/07e-equity-clearing.ts:buyInShares` | ✅ |
| D2.a VERIFY a consequence of B4 and C, never scripted | `src/domain/company.ts:shortInterestShares` | ✅ |
| D3 a recall forces the borrower to find it or close | `src/engine/simulation/stages/securities-lending.ts:soldByLender` | ✅ |
| E1 FORBID no short without a borrow | `src/domain/securities-lending.ts:SecurityLoan` | ✅ |
| E2 FORBID no double-counting the loaned security | `src/domain/securities-lending.ts:stockLoanNetUSD` | ✅ |
| E3 FORBID no free borrow | `src/engine/simulation/stages/securities-lending.ts:clearedBps` | ✅ |

Counts: 17 `✅` · 4 `⚠️` · 4 `❌`.

---

## 3. THE DIFF

**The two FORBID nodes this tree exists for both hold, and that is the headline.** E1: the only
negative equity exposure anywhere in the model is a `SecurityLoan` — a named lender, named
borrower, delivered shares, posted collateral. Nothing creates a short by writing a negative
number. E2: the register never double-counts. `deliver()` moves the shares off the lender's rows
and onto the borrower's, so Σ rows = shares issued at every instant; the lender's retained
exposure is carried once, as the scalar `stockLoanNetUSD` (mark − collateral), and 07e lowers the
lender's own holding ceiling by `lentSharesByLender` so it does not walk back into the auction to
re-buy what it just lent. Both sides net to zero at the strike price and diverge with the mark,
which is the short's P&L and the only place it lives. The findings below are all elsewhere.

### ❌ A3 / A5.b — THE LENDER LOSES THE DIVIDEND, AND PAYS FOR THE PRIVILEGE

There is no manufactured payment in this repo (`grep -rni manufactur src` finds four unrelated
uses, all about manufacturing industries). `payHoldersCash(ctx, comp.id, 'EQUITY', …)` pays
whoever the REGISTER says holds the shares — and after `deliver()` that is the borrower. So a
lender that lends across a dividend date hands the dividend to the borrower and never gets it
back. A2 is exactly why: legal title really does pass here, which is right, and the compensating
leg that makes A3 true was never written.

A5.b compounds it in the same direction. The borrower posts CASH collateral at 100% of market
value (`collateralUSD = shares * c.stockPrice`) and earns **nothing** on it — no rebate, no
interest, no reinvestment share. It also pays the cleared `feeBps`. So a borrow costs the full
fee plus the entire carry on the collateral, while the lender receives the fee, the free use of
the cash, and any dividend that falls. The borrow fee this book clears is therefore not the price
the tree describes: it is the price of one side of a two-sided trade, and the borrower's true cost
is the fee plus the funding cost of the collateral it cannot earn on.

**Becomes a §3 step**, and a compact one: the manufactured dividend is a payment on an existing
book at an existing date, and the rebate is `collateralUSD × the overnight rate` credited back —
both read numbers that already exist. It changes who is willing to lend and how large a short can
get, which is the whole subject of B4.

### ⚠️ C1 — THE COLLATERAL EXACTLY EQUALS THE LOAN, SO THERE IS NO HAIRCUT

`securities-lending.ts:470` and `:158`: struck collateral is `shares × c.stockPrice`, and the
weekly variation margin re-marks it to `loan.shares × comp.stockPrice` exactly. The lender is
therefore protected against **nothing** — a borrower that fails between two marks leaves the
lender short by the whole week's price move, which is the very number `loanOneWeekGap` already
computes for the fee. That is the asymmetry: the one-week gap is priced into the FEE (the lender
is paid for the risk) and is not covered by the COLLATERAL (the risk is not removed). Both should
be true; C1 asks for the second.

Real, and directly measurable: the book knows its own gap per name, so the haircut is
`1 + loanOneWeekGap(name)` and the arithmetic already exists in the file. **Becomes a §3 step**,
small.

### ❌ C5 / B3 — NO CHAIN, NO AGENT, AND A LATENT RE-LEND

**C5 rehypothecation** has no representation: nothing tracks that a security backing one
obligation also backs another, and the prime-brokerage book (which in reality is where
rehypothecation lives) lends against the fund's book without pledging any of it. But note what
IS reachable: `deliverable()` reads the shared holdings store, and a borrower's borrowed shares
are ordinary rows in it, so a borrower that has not yet sold them is a candidate LENDER in the
next week's auction. A chain can form; nothing would record it, and `lenderPositionAtStrike`
would treat the re-lender's onward loan as an ordinary one. Untraceable by construction, which is
what the node forbids. **Becomes a §3 step** — but it should be sized together with prime
brokerage's collateral leg, because rehypothecation without a pledged custody book is half a
mechanism.

**B3 the lending agent** is deliberately absent: `clearFinancialAsset(…, { dealerSpreadBps: 0 })`
with the comment *"Bilateral between named holders and named funds; no dealer stands between
them."* **OUT OF SCOPE** — the agent takes part of a fee that is otherwise correctly split
between two named parties, and adds an intermediary with no other function in this model.

### ⚠️ D1 — A FAILED RETURN NEVER TERMINATES

`recalledWeek` is set, the borrower's obligation goes into `buyInSharesByBorrower`, and 07e turns
it into a mandated purchase with no reservation — which is right, and is what makes D2's squeeze
move the print. What is missing is the other end. If the borrower cannot buy the shares (the
squeeze it caused priced them out, or its cash is gone), the loan is simply pushed onto `live`
again and the same buy-in is re-announced next week, for ever. D1's actual remedy — the lender
KEEPS the collateral and goes and buys the security itself, at whatever it costs — has no path.
So a failure to deliver is an infinite obligation rather than a loss crystallised on a named
party, and the lender's exposure never resolves.

**Becomes a §3 step**, small: after N weeks recalled the collateral is forfeit, the lender buys in
the market with it, and any shortfall is the lender's loss. It also gives the collateral a reason
to be more than 100% (C1).

### ⚠️ B2.a / C3 — TWO NODES SATISFIED BY ACCIDENT RATHER THAN BY A DECISION

**B2.a**: every holder offers its ENTIRE inventory to the borrow auction —
`maxHoldingUSD: held + lent`, with a reservation fee but no mandate test, no acceptable-collateral
schedule, and no per-counterparty limit. An insurer with a liability-matching mandate lends its
whole equity book to a hedge fund on the same terms a hedge fund would. The restraint is the
price alone, which is real but is not the constraint the node asks for.
**C3**: cash collateral is credited to the lender's account and thereafter is indistinguishable
from any other cash, so it goes into the same overnight sleeve as everything else and does earn a
return. It is reinvested — but nothing marks it as OTHER PEOPLE'S money that has to come back, so
the loss the node points at ("this is where a lending programme actually loses money") cannot
happen: the lender can spend the collateral on securities and still owe it. That is the same
class of defect as `repoLentUSD` being excluded from purchase capacity, and the fix is the same
one line: posted cash collateral is not spendable capacity. **Becomes a §3 step**, small.
