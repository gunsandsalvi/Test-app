# SYSTEM: FUND SHARES

A fund is a party that holds assets and issues claims on itself. The claim is the fund share; its
value is a read of the portfolio; and the fact that holders can create and redeem it is what makes
a fund different from a firm. Covers ETFs, mutual funds and money market funds — the vehicle is
one system, the mandates differ.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A FUND IS
- **A1** REASON — a **named party** with an account and a register of holdings
  (`the-register.md`)
- **A2** REASON — its **liability is its shares**, held by named holders
- **A3** REASON — its **equity is zero by construction**: assets − liabilities = 0, because the
  holders own the assets. A fund with equity has mislaid somebody's money
- **A4** REASON — it has a **mandate**: what it may hold, and the mandate is a real constraint on
  what it buys, not a label
  - A3/A4 together are why the fund is a **transmission channel**: a flow into the fund becomes a
    purchase of what the mandate allows

### B. NET ASSET VALUE
- **B1** REASON — **NAV = (assets at market − liabilities) / shares outstanding**, a read, every
  time, never a stored series (rule 4)
- **B2** REASON — the assets are marked at **cleared prices** (`the-clearing-engine.md` D4)
  - B2.a so a stale price makes a stale NAV, and somebody transacts on it — that is a real
    transfer between holders, not a rounding
- **B3** REASON — **fees accrue** and are paid to the manager, and they reduce NAV
- **B4** VERIFY — the sum of holders' share value = the fund's asset value − its liabilities,
  exactly (A3)

### C. CREATION AND REDEMPTION
- **C1** REASON — a **subscription** gives the fund cash and the holder new shares at NAV
  - C1.a and the fund must then **buy something** with the cash, per its mandate
- **C2** REASON — a **redemption** takes shares back and pays the holder cash at NAV
  - C2.a and the fund must **find the cash**: from its buffer, or by selling
  - C2.b selling is a trade into a market that must clear, at whatever price it clears
    (`the-clearing-engine.md`) — this is the forced-seller channel, and it is the point
- **C3** REASON — the shares outstanding **change**, so a fund is not fixed-size
- **C4** REASON — there is a **timing mismatch**: the holder is paid at today's NAV, the sales
  happen at tomorrow's prices, and the difference falls on the remaining holders
  - C4.a which is why a redemption is a real cost to those who stay, and why runs are a thing
- **C5** VERIFY — Σ shares created − Σ redeemed = shares outstanding, and cash in/out matches

### D. THE MONEY FUND SPECIFICALLY
- **D1** REASON — a mandate of **short, high-quality paper** (`short-term-debt.md`,
  `money-market.md`)
- **D2** REASON — it is a **substitute for a deposit**, and that is its whole economic role: a
  saver chooses between a bank deposit, a money fund and bills directly
  (`households.md` D5.a, user 2026-09-03: "households and corporates, an alternative to MMF")
  - D2.a so its yield competes with the deposit rate, and the competition is a real constraint on
    what banks pay (`banks-funding-and-liquidity.md` C)
- **D3** REASON — it is a **buyer in the short-term market**, and its size determines how much
  paper can be placed
- **D4** FORBID — **no guaranteed constant NAV.** If the assets fall, the NAV falls; a fund that
  cannot break is a fund with a hidden guarantor, and the guarantor is nobody
- **D5** VERIFY — flows into money funds should rise when their yield beats deposits, as a
  consequence of D2, never as an imposed allocation

### E. THE EXCHANGE-TRADED FUND SPECIFICALLY
- **E1** REASON — its shares **trade** on a market, at a price that clears
  (`the-clearing-engine.md`)
- **E2** REASON — so it has **two values**: the traded price and the NAV, and they are different
  numbers
- **E3** REASON — the gap is **arbitrageable**: somebody can create or redeem against the basket
  and pocket the difference
  - E3.a which is a REASON for a participant, not a rule tying the two — the gap closes because
    somebody trades, and it can persist when they will not
- **E4** VERIFY — the premium/discount is a read of two prices; a persistently large one is a
  finding about liquidity, never a number to clamp

### F. WHAT THE FUND IS NOT
- **F1** FORBID — **a fund does not create its assets.** Every holding is bought from a named
  seller at a cleared price
- **F2** FORBID — **no leverage without a lender.** A fund that holds more than it raised has
  borrowed from somebody named (`prime-brokerage.md`)
- **F3** REASON — the **manager is a separate party** that earns the fee; the fee is its income
  and the fund's cost

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a named party with an account and a register | `src/domain/institutions.ts:InstitutionalEntity` | ✅ |
| A2 its liability is its shares, held by named holders | `src/engine/ledger/holdings-ledger.ts:issueHolding` | ⚠️ |
| **A3 its equity is zero by construction** | `src/engine/simulation/initialization.ts:equityCapitalLocal` | ⚠️ |
| A4 a mandate that really constrains what it buys | `src/domain/institutions.ts:mandatePctOf` | ✅ |
| **B1 NAV is a READ, never a stored series** | `src/engine/simulation/stages/etf-flows.ts:fundNavLocal` | ⚠️ |
| B2 assets marked at cleared prices | `src/engine/ledger/holdings-ledger.ts:markHolding` | ✅ |
| B2.a a stale price makes a stale NAV somebody transacts on | `src/engine/simulation/stages/etf-flows.ts:carryPricePerShare` | ✅ |
| B3 fees accrue, are paid to the manager, and reduce NAV | `src/engine/simulation/stages/etf-flows.ts:runEtfFlowsStage` | ✅ |
| B4 VERIFY Σ holders' share value = assets − liabilities | `src/engine/simulation/stages/etf-flows.ts:finalNavPerShareByFund` | ⚠️ |
| C1 a subscription: cash in, new shares at NAV | `src/engine/ledger/holdings-ledger.ts:issueHolding` | ✅ |
| C1.a and the fund must then buy, per its mandate | `src/engine/simulation/stages/etf-demand.ts:indexFundsForBook` | ✅ |
| C2 a redemption: shares back, cash at NAV | `src/engine/ledger/holdings-ledger.ts:retireHolding` | ⚠️ |
| C2.a and the fund must find the cash: buffer, or sell | `src/engine/simulation/stages/etf-flows.ts:fundCashAvailableLocal` | ⚠️ |
| **C2.b the forced-seller channel: it sells into a market that must clear** | `src/engine/simulation/stages/etf-demand.ts:investableLocal` | ⚠️ |
| C3 shares outstanding change; a fund is not fixed-size | `src/engine2/instruments.ts:etfSharesOutstandingOf` · `src/engine/ledger/instrument-ledger.ts:setIssuedUnits` | ✅ |
| C4 a timing mismatch between the NAV paid and the sales | `src/engine/simulation/stages/etf-flows.ts:navPerShare` | ⚠️ |
| C4.a a redemption is a real cost to those who stay | `src/engine/simulation/stages/etf-flows.ts:carryPricePerShare` | ⚠️ |
| C5 VERIFY Σ created − Σ redeemed = shares outstanding | — | ❌ |
| D1 a mandate of short, high-quality paper | `src/domain/institution-profiles.ts:sovereignDurationMandate` | ✅ |
| D2 a substitute for a deposit | `src/engine/simulation/stages/money-market-fund.ts:divertHouseholdSavingsToMmf` | ✅ |
| D2.a its yield competes with the deposit rate | `src/engine/simulation/stages/money-market-fund.ts:DEPOSIT_MMF_FULL_SWITCH_GAP` | ⚠️ |
| D3 a buyer in the short-term market | `src/engine/simulation/stages/07f-short-debt-clearing.ts:runShortDebtClearingStage` | ✅ |
| **D4 FORBID no guaranteed constant NAV** | `src/engine/simulation/stages/money-market-fund.ts:distributeMoneyFundIncome` | ❌ |
| D5 VERIFY flows follow the yield, never an imposed allocation | `src/engine/simulation/stages/money-market-fund.ts:divertHouseholdSavingsToMmf` | ⚠️ |
| E1 ETF shares trade at a price that clears | `src/engine/simulation/stages/etf-flows.ts:marketPricePerShare` | ✅ |
| E2 two values: the traded price and the NAV | `src/domain/etf.ts:premiumToNavBps` | ✅ |
| E3 the gap is arbitrageable by create/redeem | `src/domain/etf.ts:apWeeklyCapacityLocal` | ✅ |
| E3.a a REASON for a participant, not a rule tying the two | `src/engine/simulation/stages/etf-flows.ts:primaryWithdrawStat` | ✅ |
| E4 VERIFY the premium is a read, never a number to clamp | `src/domain/etf.ts:premiumToNavBps` | ✅ |
| F1 FORBID a fund does not create its assets | `src/engine/simulation/stages/07e-equity-clearing.ts:runEquityClearingStage` | ✅ |
| F2 FORBID no leverage without a lender | `src/engine/simulation/stages/overdraft-sweep.ts:runOverdraftSweep` | ⚠️ |
| F3 the manager is a separate party earning the fee | `src/domain/etf.ts:sponsorEntityId` | ✅ |

Counts: 18 `✅` · 12 `⚠️` · 2 `❌`.

---

## 3. THE DIFF

### ❌ D4 — THE MONEY FUND'S NAV IS ONE DOLLAR BY CONSTRUCTION, AND IT CANNOT BREAK

The node the user's own doctrine writes twice, and the code has its opposite in the most literal
possible form. A money fund's liability is `mmfSharesOutstandingLocal` — **a number of DOLLARS, not
a number of shares** (`institutions.ts:174`: *"the fund's share liabilities at its fixed $1 NAV"*).
Its holders' claims are dollar fields too: `company.mmfSharesLocal` and
`householdState.mmfSharesLocal`. There is no share count anywhere in the money-fund complex, so
there is no quantity a price could be per.

`distributeMoneyFundIncome:252` is the whole mechanism:

    const paidToHoldersLocal = Math.max(0, bookLocal - feeLocal - (e.mmfSharesOutstandingLocal ?? 0));

A gain becomes NEW SHARES issued pro rata (`:280`), which is right — that is how a stable-NAV fund
distributes. **A LOSS does nothing.** `Math.max(0, …)` returns zero, the share liability stands
where it was, and every holder's claim is still worth exactly what it was worth. The module's own
comment states the intent and then states the gap: *"a genuine LOSS leaves book below shares and
distributes nothing, which is what breaking the buck looks like and exactly what the harness's
departure check should catch"* — so the buck breaking is a MEASUREMENT of a divergence, never an
event that reaches a holder. `corporateSweepDecision:187` then redeems at `paidLocal = wantedLocal`,
one dollar of cash per dollar of shares, whatever the fund's assets are worth.

**What this makes impossible.** The saver's choice in D2 is between a deposit that can fail with
its bank (`bank-resolution.ts` is real) and a money fund that cannot fail at all, so the
competition in D2.a is between a risky asset and a risk-free one — which is not the choice, and it
biases every flow the yield gap drives. A run on a money fund is unrepresentable, and the money
fund is the one vehicle in this world whose runs are the thing worth having. The guarantor is
nobody, which is exactly what the node forbids.

**§3 step 37-MMF**, . It is the same shape as step 13 one class over: the fix is a share COUNT
and a NAV that is `assets / shares`, at which point breaking the buck is a read and needs no new
mechanism. Medium size — the holders' claims (`mmfSharesLocal` on companies and on
`householdState`) have to become quantities too, and `assets/index.ts:200` already anticipates an
`MMF_SHARE` holding type that `HoldingType` does not have (**Already §3 step 32** for that half).

### ⚠️ C2.b / C4.a — THE FORCED SELLER EXISTS, BUT NOT WHERE THE REDEMPTION IS

The tree's point, checked directly. There are three redemption paths and none of them is a sale
into a market that must clear:

1. **An institutional ETF redemption is IN KIND** (`etf-flows.ts:490-620`). The fund slices its
   own book pro rata and `transferHolding`s the basket, plus a cash slice, to the redeemer.
   Nothing is sold, no price moves, and — as the code correctly argues — that is a real property
   of a real ETF. But it means C4/C4.a's cost to remaining holders is genuinely zero, so the
   channel the tree calls "the point" is absent from the largest fund complex in the model.
2. **A household ETF redemption is cash**, and is rationed by the fund's cash rather than met by
   selling: `householdCashFillRatio = min(1, fundCashAvailableLocal / -householdLocal)`. What the fund
   cannot pay is simply not paid this week, and there is no queue — the unfilled part is dropped.
3. **A money fund redemption** is bounded the same way (`openCorporateSweepBooks` sets
   `redeemableLocal` to the fund's OPENING cash and `corporateSweepDecision` draws it down).

The one place a redemption does reach a market is indirect and a week late: `indexFundsForBook`
computes `investableLocal = (holdings + cash) × (1 − expenseRatio)` with cash SIGNED, so a fund left
short of money next week targets a smaller basket and the next clearing session sells it back to
solvency. That is a real refill path and it is deliberate (`etf-demand.ts:76-81`). It is not the
node: the sale is driven by the fund's cash position at the following week's open, not by the
redemption, and it goes through the index target rather than a seller with an obligation.

**§3 step 37-OPENFUND, with 37-MARGIN owning the sale**, and it is the open-ended fund the model does not have. An ETF that redeems
in kind is correct; a MUTUAL fund — same tree, `fund-shares` covers all three vehicles — redeems
in cash and must sell, and that vehicle has no representation at all. Sizing it: the vehicle
exists (an `ASSET_MANAGER` with a book), what is missing is a redeemable share on it and the
ordering that puts the sale in the same week as the redemption.

### ⚠️ A3 / B1 — WHOSE EQUITY IS ZERO, AND WHOSE NAV IS A READ

Checked per kind, because the answer differs:

| kind | equity | NAV |
|---|---|---|
| ETF | `equityCapitalLocal: 0` at seed (`initialization.ts:1449`) and never written again — `household-balance-sheet.ts:51` skips every kind whose `beneficiariesAreHouseholds` is false | `fundNavLocal` is a live row walk plus cash: **a READ** ✅ |
| MONEY_MARKET_FUND | `0` at seed, never written; the book exceeds the share liability by exactly the undistributed fee, which `distributeMoneyFundIncome` clears each week | a stored constant, 1 — see D4 |
| PRIVATE_EQUITY | **`equityCapitalLocal: investedLocal`** (`initialization.ts:1488`) — a non-zero seed, never updated again | `sponsorPortfolioLocal`, a model mark (`private-equity.md` C5.a) |
| HEDGE_FUND | a live RESIDUAL, `totalAssets − beneficiaryLiability`, which absorbs every gain and loss the investors should bear (`hedge-funds.md` A2) | a read ✅ |

So A3 holds for the two vehicles it most matters for and fails on the other two, and in no case is
the equity a READ — it is a stored field that happens to be zero. `institutions.ts:103`'s own
header says total assets are a read and the liability is a residual; the equity is neither.

Two related representation gaps, both real:
- **A2**: an ETF share is a register row (`ETF_SHARE`) with a share count. A money fund share is
  not on the register at all — it is `mmfSharesLocal`, a dollar scalar on the holder. So half the
  fund complex's liabilities are invisible to `auditOwnership`, which is why `ownership.ts:99`
  skips vehicle claims entirely and why **C5 has no check at all**: nothing anywhere reconciles Σ
  created − Σ redeemed against `sharesOutstanding`. That is a measurement, **for §3 step 38**.
- **B4**: holders' `ETF_SHARE` rows are re-marked at `marketPricePerShare` when the share book has
  cleared (`etf-flows.ts:790`), NOT at NAV. So Σ claims exceeds Σ assets by exactly the premium.
  The code names this and defends it (*"the premium is a transfer between holders"*), which is the
  right economics for a traded share and means B4's identity as written can never hold for an ETF.
  The node is the one that should move, not the code — recorded here rather than as a step.

### ⚠️ D2.a / D5 — THE DEPOSIT-VERSUS-FUND SPLIT IS AN IMPOSED ALLOCATION

`divertHouseholdSavingsToMmf:105`: `divertedShare = Math.min(1, gap / DEPOSIT_MMF_FULL_SWITCH_GAP)`
with the gap constant at 0.01. D5 is a VERIFY node — *"flows into money funds SHOULD rise when
their yield beats deposits, as a consequence of D2, never as an imposed allocation"* — and this is
the imposed allocation, stated in the file's own comment (*"a stated primitive standing in for
real household choice — MS owns replacing it"*). It is a §3 step-31-class stated shape with a
named owner. **Already §3 step 31** in kind; the specific constant is not listed there, so it is
worth adding to that step's walk rather than becoming a step of its own.

### ⚠️ F2 — AN ETF CAN BE LEVERED BY A SWEEP NOBODY DECIDED

`institution-profiles.ts` says `leverage: 'NONE'` for ETF and MONEY_MARKET_FUND, and
`availablePurchaseCapacityLocal` honours it — no allowance enters the budget. But
`overdraft-sweep.ts:73` lends to **a fund of any kind** whose close balance is negative:
`if (fund.region !== regionId || fund.isDefaulted || !fund.homeBankId) return fund;` — no
kind test — and the draw goes on the region's prime-brokerage book past the struck line at a
penalty — since §9.20-ii only to the broker's own leverage room, and refused past it. The node
is satisfied in letter (the lender is named, the loan is priced, the lender can say no) and broken
in spirit: the registry states a fact about the kind that a different file contradicts every week
an index fund overspends, which `etf-demand.ts:85` says happens routinely. **§3 step 37-MARGIN**,
small: either the sweep respects the kind's `leverage` row, or the row stops claiming `NONE`.

### Also marked, briefly

- **C2 ⚠️ / C2.a ⚠️** — a redemption retires shares at NAV and is rationed by the fund's opening cash, never met by selling — C2.b/C4.a above, 37-OPENFUND and 37-MARGIN.
