# SYSTEM: EQUITY

The residual claim on a firm: shares, their price, their holders, what the firm does with them and
what the holder gets. Excludes the firm's operations (its own system) and fund shares — an ETF or
MMF unit is a claim on a portfolio, not on a firm, and is its own tree.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A SHARE IS
- **A1** REASON — a **residual claim**: what is left after every other claim is paid
  - A1.a it therefore ranks **below all debt** — the waterfall in `corporate-credit.md` G5 ends here
  - A1.b its value can be **zero and not negative**: limited liability is a real property
- **A2** REASON — counted in **SHARES**, a unit that is not money
  - A2.a a **share count** that changes only by a named event (A5, D, E)
- **A3** REASON — a **CURRENCY** it is quoted in — the issuer's own money
- **A4** REASON — it is **PERPETUAL**: no maturity, no redemption. Unlike every node of
  `../instruments/bond.md`, and the reason equity is a different instrument rather than a long bond
- **A5** REASON — **CONTROL** rides with it: a vote per share
  - A5.a which makes a majority a thing that can be **bought** — see `m-and-a`
  - A5.b VERIFY — control has a value distinct from the cash flows, and a takeover pays for it
- **A6** REASON — an **IDENTITY** a market would use: a ticker and a name

### B. THE PRICE
- **B1** REASON — holders and buyers **post schedules**; who trades is the outcome
- **B2** REASON — **a PRICE clears** per share, per period, from B1 meeting B1
- **B3** FORBID — **the price is never derived from an earnings multiple, a book value, a DCF or a
  target.** Those are opinions HELD BY participants that enter their schedules; a price computed
  from one is the opinion restated, not a market
- **B4** REASON — **market capitalisation is a READ**: shares × price. Never a stored number
  - B4.a FORBID — nothing may compare market cap against shares × price and call it a check. That
    is a tautology and cannot fail
- **B5** REASON — a **dealer or market maker** intermediates out of inventory and capital, and
  earns the spread it quotes
- **B6** VERIFY — a seller with no buyer keeps its shares; there is no invisible bid

### C. THE HOLDER
- **C1** REASON — a **register**: who holds how many shares
  - C1.a VERIFY — Σ held = shares outstanding, always
  - C1.b the **free float** is what is genuinely tradeable — insiders and strategic holders are not
- **C2** REASON — holder classes hold for **different reasons**, which is what gives two sides
  - C2.a **households**, directly
  - C2.b **institutions** with mandates — and a mandate is a constraint, not a preference
  - C2.c **index funds**, which do not price at all: they hold weight, whatever it costs
  - C2.d **the issuer itself**, via treasury shares (D2)
  - C2.e **insiders and founders**, whose holding is not for sale
- **C3** REASON — marked at the cleared price; value is shares × price
- **C4** REASON — the change in the mark is **P&L reaching the holder's income**
- **C5** REASON — a leveraged holder **funds** the position and can be **forced to sell**
  - C5.a margin, and a call on it — the link to `money-market.md` D1
- **C6** REASON — it can be **lent** (see `securities-lending.md`) and **pledged**, at a haircut
- **C7** REASON — a **short** position is possible, is a borrow, and has a real cost and a real
  squeeze risk

### D. WHAT THE FIRM DOES WITH IT
- **D1** REASON — **ISSUANCE**: the firm sells new shares for cash
  - D1.a it **dilutes** existing holders — the share count rises and each claim shrinks
  - D1.b it is a **decision with a reason**: a funding need it prefers to meet with equity
  - D1.c it is **priced by the market**, at a discount the market demands, and can **fail**
- **D2** REASON — **BUYBACK**: the firm buys its own shares for cash
  - D2.a the count **falls**; each remaining claim grows
  - D2.b the cash is **gone** — a buyback is a distribution, not an investment
  - D2.c it competes with D3 and with real investment, and the choice has a reason
- **D3** REASON — **DIVIDEND**: cash paid per share to whoever holds it on a date
  - D3.a it leaves the firm and arrives at named holders
  - D3.b it is a **decision**, and cutting it is an event other participants react to
- **D4** REASON — a **split** changes the count and not the value, and must not change anything else

### E. CORPORATE EVENTS
- **E1** REASON — **M&A**: shares bought for cash, for stock, or for both (see `m-and-a`)
- **E2** REASON — a **spin-off**: a new share line, and a claim divided
- **E3** REASON — **DELISTING / TAKE-PRIVATE**: the line stops trading and the register is bought out
- **E4** REASON — **INSOLVENCY**: equity is **wiped before any creditor takes a loss** (A1.a), and
  the register goes to zero rather than to a recovery

### F. WHAT THE HOLDER IS ENTITLED TO
- **F1** REASON — the **dividend** when declared (D3)
- **F2** REASON — the **residual on wind-up**, after every other claim (A1)
- **F3** REASON — a **vote** (A5)
- **F4** FORBID — **no entitlement to earnings that were not distributed.** Retained earnings raise
  the claim's value through B2 and reach the holder only on sale or on F1/F2 — never as income
  credited to a holder who did not receive cash

### G. THE AGGREGATE
- **G1** REASON — an **index** built from real prices and real free-float weights (C1.b)
- **G2** VERIFY — the index is a read of its constituents and cannot move independently of them
- **G3** VERIFY — a derived statistic (P/E, dividend yield, book-to-market) is computed from the
  cleared price and never used to set it — B3 again, at the aggregate

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a residual claim | `src/engine/equity-valuation.ts:companyBookEquityLocal` | ✅ |
| A1.a ranks below all debt | `src/engine/simulation/stages/estate-resolution.ts:CLAIM_SENIORITY` | ✅ |
| A1.b value can be zero, not negative | `src/engine2/stage08-back.ts:newStockPrice` | ✅ |
| A2 counted in SHARES | `src/domain/banking.ts:quantityShares` | ✅ |
| A2.a a share count changed only by a named event | `src/engine/ledger/instrument-ledger.ts:setIssuedUnits` · `src/engine2/stage08-back.ts:sharesToRetire` | ✅ |
| A3 a currency it is quoted in | `src/domain/geography.ts:currencyOf` | ⚠️ |
| A4 PERPETUAL — no maturity, no redemption | `src/domain/assets/index.ts:HoldingType` | ✅ |
| **A5 CONTROL rides with it: a vote per share** | `src/domain/company.ts:ownership` | ⚠️ |
| A5.a a majority can be bought | `src/engine/simulation/stages/10-mergers.ts:runMergersStage` | ✅ |
| A5.b VERIFY control has a value a takeover pays for | `src/engine/simulation/stages/pe-lifecycle.ts:PATIENT_HOLDER_REQUIRED_RETURN` | ✅ |
| A6 an identity: a ticker and a name | `src/domain/company.ts:ticker` | ✅ |
| B1 holders and buyers post schedules | `src/engine/simulation/stages/07e-equity-clearing.ts:runEquityClearingStage` | ✅ |
| B2 a PRICE clears per share | `src/engine/simulation/stages/financial-clearing-engine.ts:clearFinancialAsset` | ✅ |
| B3 FORBID price never from a multiple, book value, DCF or target | `src/engine/equity-valuation.ts:fairValuePerShare` | ✅ |
| B4 market capitalisation is a READ | `src/domain/company.ts:marketCapOf` | ✅ |
| B4.a FORBID no tautological market-cap check | `src/engine/audit/ownership.ts:auditOwnership` | ✅ |
| B5 a dealer intermediates out of inventory and capital | `src/engine/simulation/stages/dealer-desks.ts:buildDealerDeskParticipants` | ✅ |
| B6 VERIFY a seller with no buyer keeps its shares | `src/engine/simulation/stages/07e-equity-clearing.ts:unsoldStaysWithHolder` | ✅ |
| C1 a register: who holds how many shares | `src/engine2/holdings.ts:HoldingStore` | ✅ |
| C1.a VERIFY Σ held = shares outstanding | `src/engine/audit/ownership.ts:auditOwnership` | ✅ |
| C1.b the free float is what is genuinely tradeable | `src/engine/simulation/stages/07e-equity-clearing.ts:heldByInstitutionsShares` | ✅ |
| C2 holder classes hold for different reasons | `src/domain/institution-profiles.ts:INSTITUTION_PROFILES` | ✅ |
| C2.a households, directly | `src/engine/ledger/holdings-ledger.ts:householdBookId` | ⚠️ |
| C2.b institutions with mandates | `src/domain/cross-border.ts:mandateWeightForIssuer` | ✅ |
| C2.c index funds, which do not price | `src/engine/simulation/stages/etf-demand.ts:indexFundDemand` | ✅ |
| **C2.d the issuer itself, via treasury shares** | — | ❌ |
| C2.e insiders and founders, not for sale | `src/domain/company.ts:ownership` | ✅ |
| C3 marked at the cleared price | `src/engine/ledger/holdings-ledger.ts:markBookToMarket` | ✅ |
| **C4 the change in the mark is P&L reaching the holder's income** | `src/engine/simulation/stages/institutional-balance-sheet.ts:accrueInstitutionalIncome` | ⚠️ |
| C5 a leveraged holder funds and can be forced to sell | `src/domain/prime-brokerage.ts:maxDrawnLocal` | ⚠️ |
| C5.a margin, and a call on it | `src/engine/simulation/stages/prime-brokerage.ts:runPrimeBrokerageStage` | ⚠️ |
| C6 it can be lent and pledged, at a haircut | `src/engine/simulation/stages/prime-brokerage.ts:measuredHaircutsFor` | ✅ |
| C7 a short is a borrow with a cost and a squeeze risk | `src/domain/securities-lending.ts:shortSizeShares` | ✅ |
| **D1 ISSUANCE: the firm sells new shares for cash** | `src/engine/simulation/stages/primary-settlement.ts:settlePricedOfferings` | ⚠️ |
| D1.a it dilutes existing holders | `src/engine/simulation/stages/07e-equity-clearing.ts:liveSharesOf` | ✅ |
| **D1.b a decision with a reason: a funding need met with equity** | — | ❌ |
| D1.c priced by the market, at a discount, and can fail | `src/engine/simulation/stages/primary-settlement.ts:settlePricedOfferings` | ✅ |
| D2 BUYBACK: the firm buys its own shares for cash | `src/engine2/stage08-back.ts:buybacksThisWeek` | ✅ |
| D2.a the count falls | `src/engine2/stage08-back.ts:sharesToRetire` | ✅ |
| D2.b the cash is gone — a distribution, not an investment | `src/engine/simulation/stages/shared-helpers.ts:payHoldersCash` | ✅ |
| D2.c it competes with the dividend and with investment | `src/engine2/stage08-back.ts:buybackShare` | ⚠️ |
| D3 DIVIDEND: cash per share to whoever holds on a date | `src/domain/company-week/distributions.ts:dividendDecision` | ✅ |
| D3.a it leaves the firm and arrives at named holders | `src/engine/simulation/stages/shared-helpers.ts:payHoldersCash` | ✅ |
| D3.b a decision, and a cut is an event others react to | `src/domain/company-week/distributions.ts:dividendDecision` | ⚠️ |
| **D4 a split changes the count and not the value** | — | ❌ |
| E1 M&A: shares bought for cash, stock or both | `src/engine/simulation/stages/10-mergers.ts:runMergersStage` | ✅ |
| E2 a spin-off: a new share line, a claim divided | `src/engine/simulation/stages/10-mergers.ts:spinShares` | ✅ |
| E3 DELISTING / TAKE-PRIVATE | `src/engine/simulation/stages/pe-lifecycle.ts:settlePeLifecycleDeals` | ✅ |
| E4 INSOLVENCY: equity wiped before any creditor takes a loss | `src/engine/simulation/stages/estate-resolution.ts:runEstateResolutionStage` | ✅ |
| F1 the dividend when declared | `src/engine/simulation/stages/shared-helpers.ts:payHoldersCash` | ✅ |
| F2 the residual on wind-up | `src/engine/simulation/stages/estate-resolution.ts:CLAIM_SENIORITY` | ✅ |
| **F3 a vote** | — | ❌ |
| F4 FORBID no entitlement to undistributed earnings | `src/engine/simulation/stages/institutional-balance-sheet.ts:accrueInstitutionalIncome` | ✅ |
| G1 an index on real prices and free-float weights | `src/engine/simulation/stages/index-calculation.ts:rebalance` | ⚠️ |
| G2 VERIFY the index is a read of its constituents | `src/engine/simulation/stages/index-calculation.ts:basketValueLocal` | ✅ |
| G3 VERIFY a derived statistic never sets the price | `src/engine/simulation/stages/pe-lifecycle.ts:publicComparableEvMultiple` | ⚠️ |

Counts: 41 `✅` · 11 `⚠️` · 4 `❌`.

---

## 3. THE DIFF

### ⚠️ THE STORED VALUE ON THE REGISTER ROW — narrowed to a CACHE, §9.13-EQUITY

Equity is the only asset in this model that stores a price, and the register row stores the VALUE
as well: `07e` writes `quantityShares`, `quantityOrNotionalLocal: shares × comp.stockPrice` and
`units: shares` on one row. Step 13's survey table names this exact row and its item 4 is *"the
equity row's stored value has to go"*.

**What C3 was actually ✅ on, and what it hid.** The mapping cited `markHolding` — a one-row setter
— for a node that asks whether a HOLDER is marked at the cleared price, and the honest answer was
no: only a session that TOUCHED a row rewrote its value, so a holder that did not trade this week
carried its shares at a stale print, and its NAV, its capital ratio and every allocation sized off
them were struck on last week's market. **§9.13-EQUITY closed it**: `register-marking` runs at the
close over every row of every book, and an equity row is `shares × its issuer's own cleared print`
whether or not that holder traded. C3 now cites the walk that does it.

What is left under this heading is the FIELD, not the number in it: the value is a cache re-derived
every week rather than a function computed at every read, which is where step 13's structure ends
up (*"value is a FUNCTION, `units × price(asset)`, never a field"*) and where credit stands too. One
consequence to keep in view while it survives: the stored value is what `securities-lending.ts:79`
and `07e:248` fall back to when `quantityShares` is absent
(`quantityOrNotionalLocal / stockPrice`), so the two representations are load-bearing for each
other in two stages, not one.

### ⚠️ A5 / ❌ F3 — THERE IS NO VOTE, SO CONTROL IS A PERCENTAGE AND NOT A CLAIM

Nothing in `src` contains a vote (`grep -rni vote src` returns nothing about equity). Control is
`company.ts:ownership` — `founderPct`, `peSponsorPct` — a share of the register carried as a
number on the company, and the register itself (the `EQUITY` rows) has no governance meaning at
all. The consequences are specific rather than cosmetic:
- a take-private (`pe-lifecycle:615`) extinguishes the whole register by paying every holder
  `payHoldersCash`, because there is no tender any holder could refuse. `settleCorporateActionOnHolders`
  takes 100% of the shares whatever a holder thinks of the price;
- A5.b's control premium DOES exist and is derived honestly (`PATIENT_HOLDER_REQUIRED_RETURN` —
  the takeout must clear the most patient holder's reservation, never the marginal one's), so the
  PRICE of control is real while the THING being bought is not represented;
- a merger cannot be contested, blocked, or won at a higher price by a rival bidder, because
  nobody holds anything that could be voted.

**§3 step 37-SMALL**, and a small one: a vote is a read of the register (`shares`), not a new
store. What it unlocks — contested bids, a board that answers to holders, a founder block that
can refuse — is larger than the change.

### ❌ D1.b / D4 — A LISTED FIRM CANNOT ISSUE EQUITY, AND SHARES NEVER SPLIT

`grep "instrumentType: 'EQUITY'"` over every `primaryOfferingsWorking.push` site finds exactly one
producer: `pe-lifecycle.ts:369`, the sponsor's IPO. **No firm in this model ever raises equity as
a funding decision.** `corporate-financing.ts` — the module whose whole job is "how a firm covers
a shortfall" — queues debt only; `stage08-back.ts:2044` can BUY BACK shares but there is no
opposite arm. So the financing choice a firm actually faces (debt against equity, at the prices
both are quoting) does not exist: leverage can only ever rise except by repayment, and a firm shut
out of the loan market has no second door. D1's machinery is all present and works — the IPO
prices in 07e's book, dilutes through `liveSharesOf`, and is pulled at `walkAwayStat` — so this is
a missing CALLER, not a missing mechanism.

D4 (a split) is absent outright, and is genuinely **OUT OF SCOPE**: with the register in shares
and every read a `shares × price`, a split is a no-op by construction and there is nothing for it
to test.

### ⚠️ C4 — A HOLDER'S EQUITY P&L NEVER REACHES ITS INCOME

`accrueInstitutionalIncome` walks the holder's book and accrues `GOV_BOND` coupons only; the loop
skips every `EQUITY` row. An institution's equity gains therefore change `institutionTotalAssetsLocal`
(a read of the marked rows, so the wealth is real) and change nothing on any income statement —
`lastWeeklyInvestmentIncomeLocal` is bond income alone. That matters beyond reporting, because
`household-balance-sheet.ts:70` grows the household claim on every fund by exactly
`lastWeeklyInvestmentIncomeLocal`: **a fund's equity performance never reaches its beneficiaries**,
and the whole difference lands in the fund's own `equityCapitalLocal` residual. Same defect as
`hedge-funds.md` A2, seen from the equity side. **§3 step 37-SMALL** (shared with that one).

### ❌ C2.d — A BUYBACK RETIRES, IT DOES NOT CREATE TREASURY STOCK

`stage08-back:2060` computes `sharesToRetire` and `2062` reduces the count. There is no treasury
holding and the issuer never appears on its own register. **OUT OF SCOPE**: treasury stock is an
accounting form for the same economics (cash out, claim count down), and the model books the
economics. Recorded so it is not re-found.

### ⚠️ G1 / G3 — INDEX WEIGHTS ARE FULL MARKET CAP, AND THE COMPARABLE MULTIPLE PRICES PRIVATE FIRMS

`index-calculation.ts:121` weights by `indexValueLocal`, which for an equity index is `marketCapOf`
— the WHOLE share count, not the free float 07e already computes for the same names
(`heldByInstitutionsShares + deskHeldShares`). So an index fund buys weight in a name the register
says is mostly unsellable, and the index level moves with holdings nobody could trade. The float
read exists one file away; this is a wiring gap, not a missing mechanism.

G3 holds for listed equity — every derived statistic is computed off the cleared print. It fails
one level out: `publicComparableEvMultiple` takes the median of `(marketCap + debt) / ebitda`
across cleared names and then SETS the price of every private company, every LBO and every
sponsor-to-sponsor sale. That is `private-equity.md` C5.a's finding and is recorded there.

### ⚠️ A3 / C2.a / C5.a — READS THAT EXIST BUT ARE NOT THE ONE THE NODE ASKS FOR

**A3**: a share's currency is its issuer's region's, read through `currencyOf(comp.region)` at
every payment site — never a field on the instrument. That is §3 step 13c's subject exactly
(*"an asset declares … `quoteCurrency`"`*), and it is **Already §3 step 13c**.
**C2.a**: households now HOLD their listed equity — a register book per region
(`holdings-ledger.ts:householdBookId`), opened by wire at the seed with exactly the shares no named
book held and moved only by trade since, walked by the corporate actions, consolidated and marked
like anyone else's, and shown as a holder in the UI (§9.13-EQUITY). What it replaced was the
register's RESIDUAL: `liveShares` minus what institutions and desks hold, recomputed from scratch
by two different routes that could disagree, paid its dividends under a second name ("the public
float"), and — being nobody's rows — invisible to every walk that scales or pays a holder. The node
stays ⚠️ for the half that is left: households still have **no buy schedule**, so the largest
holder class in the model is a one-way participant that can be forced to sell (§7.281) and can
never bid. That is a mechanism, not a representation, and it is what C2.a will close on.
**C5.a**: the margin call on a levered equity holder is real money (`prime-brokerage.ts:158`) but
an unmet one has no consequence — see `prime-brokerage.md` C3/C5, which owns it.

### Also marked, briefly

- **D2.c ⚠️** — `buybackShare` is a stated split between dividend and buyback, not a choice against investment.
- **D3.b ⚠️** — a dividend cut is decided and paid, and no participant reacts to the cut as an event.
