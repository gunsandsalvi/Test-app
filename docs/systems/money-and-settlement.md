# SYSTEM: MONEY AND SETTLEMENT

What money IS in this model, where it sits, and how it moves. The ledger: accounts, payments,
wires, and the interbank leg behind them. Every other system's cash leg lands here, so an error
here is an error everywhere.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut. **Contaminated**: I rebuilt much of this layer
earlier in the same session (§9.13c), so treat the confirmations as worthless and judge it on
branches D, E and F.

### A. WHAT MONEY IS
- **A1** REASON — money is a **liability of somebody**. Every unit is owed by a named issuer
  - A1.a a **deposit** is a named bank's liability to a named holder
  - A1.b a **reserve** is the central bank's liability to a named bank
  - A1.c **currency in circulation** is the central bank's liability to a bearer
  - A1.d FORBID — **no money without an issuer.** A balance that is nobody's liability is money
    created from nothing, and it is the defect every conservation check exists to catch
- **A2** REASON — money is **denominated**: a unit is a unit OF a currency (see `currency-and-fx`)
  - A2.a a holder's own money is the one it keeps its books in
  - A2.b FORBID — two currencies are never added. A sum across them is a conversion at a stated
    rate, or it is meaningless
- **A3** REASON — money is **fungible within its issuer and currency** and not across them
- **A4** VERIFY — the **money stock** is a read of A1's liabilities, never a stored aggregate

### B. WHERE IT SITS
- **B1** REASON — an **ACCOUNT** is (holder, issuer, currency). All three, or it is ambiguous
  - B1.a a holder may have several, and holding a foreign currency is a real position
  - B1.b VERIFY — Σ(accounts at an issuer) = that issuer's money liability
- **B2** REASON — a balance is **carried**, week to week, and changes only by a named movement
- **B3** REASON — a balance can be **negative**, and what that means differs by holder
  - B3.a a customer overdrawn is **borrowing**, and it is a credit decision by its bank
  - B3.b a bank overdrawn at the central bank is **borrowing from the central bank**, and the
    corridor prices it (`money-market.md` C)
  - B3.c FORBID — an overdraft is never a silent negative. Somebody lent it, at a rate

### C. HOW IT MOVES
- **C1** REASON — a **PAYMENT** is an instruction: payer, payee, amount, **currency**, reason
  - C1.a it names both sides. A payment to nobody is not a payment
  - C1.b it carries the **reason** it happened, so a unit is traceable to why it moved
  - C1.c it may be **dated**: an obligation falling due later is an instruction now and cash then
- **C2** REASON — settlement applies each instruction by **one rule**: payer −a, payee +a
  - C2.a and **the interbank leg**: where the two sit at different banks, reserves move between
    those banks. That is what settlement IS
  - C2.b same-bank payment moves **no reserves** — it is a relabelling of one bank's liability
  - C2.d VERIFY — Σ(all legs) = 0, per currency, every pass
- **C3** REASON — a payment across currencies is **two amounts and a rate**, and somebody sells
  the currency (`money-market`/`fx-spot`). Never a restatement of one number
- **C4** REASON — **the money creators are enumerable and few**
  - C4.a a **bank writing a loan** creates a deposit (`banks-lending.md` B)
  - C4.b the **central bank** buying an asset or lending creates reserves
  - C4.c VERIFY — the money stock's change equals C4.a + C4.b and nothing else. Any other source
    is A1.d

### D. THE WIRE — EVERY MOVE IS AN INSTRUCTION
- **D1** REASON — **every asset move is a numbered instruction**, money included: from, to, asset,
  quantity, price, reason
  - D1.a it is numbered, so a position can be **replayed** from its wires
  - D1.b a residual is therefore a **missing wire**, never a mystery
- **D2** REASON — money is an **asset like any other** in this ledger: a quantity of a currency at
  a price of one of itself
- **D3** VERIFY — for every asset kind, Σ(wires in) − Σ(wires out) = the change in holdings
- **D4** FORBID — **no move without a wire.** A book that changes with no instruction behind it is
  the same defect as A1.d, one level up

### E. FAILURE AND FINALITY
- **E1** REASON — a payer that **cannot pay** is a real state with a real consequence
  - E1.a it does not silently not happen, and it does not silently overdraw
  - E1.b the payee has a **receivable that did not arrive** — see `trade-credit`
- **E2** REASON — **settlement is final**: once applied, a payment is not reversed
  - E2.a an error is corrected by a **new** payment in the other direction, which is itself
    traceable
- **E3** REASON — **order matters within a pass**, and the order is defined. Two instructions that
  both draw on one balance cannot both succeed by luck
- **E4** REASON — a party that **ceases to exist** mid-pass still has its legs settled or refused
  by name — never dropped

### F. WHAT SETTLEMENT REPORTS
- **F1** REASON — the pass produces a **statement per book**, in that book's own money
  - F1.a a treasury's flows, a household sector's, a bank's reserves, a pool's income
  - F1.b FORBID — a per-book statement is never a sum across currencies (A2.b)
- **F2** REASON — the **gross** and the **net** are different numbers and both are reported
- **F3** VERIFY — the clearing house's residual is **zero**, per asset and per currency
- **F4** VERIFY — money that landed on a holder with no account is **counted, never dropped**

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 money is a liability of somebody | `src/engine/ledger/accounts.ts:accountKey` | ✅ |
| A1.a a deposit is a named bank's liability | `src/engine/ledger/accounts.ts:depositLinesAt` | ✅ |
| A1.b a reserve is the central bank's liability to a bank | `src/engine/ledger/accounts.ts:reserveRowOf` | ✅ |
| A1.c currency in circulation | `src/engine/bootstrap/close-seed.ts:currencyInCirculationLocal` | ❌ |
| **A1.d FORBID no money without an issuer** | `src/engine/ledger/accounts.ts:applySettledRow` | ✅ |
| A2 money is denominated | `src/engine2/world.ts:CURRENCY_ID` | ✅ |
| A2.a a holder's own money | `src/engine/ledger/accounts.ts:homeCurrencyOf` | ✅ |
| **A2.b FORBID two currencies are never added** | `src/domain/currency.ts:convert` | ✅ |
| A3 fungible within its issuer and currency | `src/engine/ledger/accounts.ts:balanceOfIn` | ✅ |
| A4 the money stock is a read | `src/domain/banking.ts:spendableDepositsOf` | ✅ |
| B1 an account is (holder, issuer, currency) | `src/engine/ledger/accounts.ts:openRow` | ✅ |
| B1.a several accounts; foreign currency is a real position | `src/engine/ledger/accounts.ts:rowsInCurrency` | ✅ |
| B1.b VERIFY Σ(accounts at an issuer) = its money liability | `src/engine/audit/money.ts:m5` | ⚠️ |
| B2 a balance is carried and changes only by a named movement | `src/engine/ledger/accounts.ts:projectBooks` | ✅ |
| B3 a balance can be negative | `src/engine/ledger/accounts.ts:treasuryNetOf` | ✅ |
| B3.a a customer overdrawn is borrowing — a **credit decision** | `src/engine/simulation/stages/overdraft-sweep.ts:runOverdraftSweep` | ⚠️ |
| B3.b a bank overdrawn at the CB borrows, priced by the corridor | `src/engine/simulation/stages/bank-lending.ts:raiseCentralBankLoanLocal` | ⚠️ |
| **B3.c FORBID an overdraft is never a silent negative** | `src/engine/simulation/stages/overdraft-sweep.ts:runOverdraftSweep` | ✅ |
| C1 a payment is an instruction | `src/engine/simulation/stages/settlement.ts:PaymentInstruction` | ✅ |
| C1.a it names both sides | `src/engine/ledger/wire.ts:wirePush`, `src/engine/ledger/entity-index.ts:companyOfParty` | ✅ |
| C1.b it carries the reason | `src/engine/ledger/payment-category.ts:categoryOfReason` | ✅ |
| C1.c it may be dated | `src/engine/simulation/stages/settlement.ts:rowDue` | ✅ |
| C2 settlement applies each instruction by one rule | `src/engine/ledger/accounts.ts:applySettledRow` | ✅ |
| C2.a the interbank leg | `src/engine/ledger/accounts.ts:reserveRowFor` | ✅ |
| C2.b same-bank payment moves no reserves | `src/engine/ledger/accounts.ts:leg` | ✅ |
| C2.d VERIFY Σ(all legs) = 0, per currency | `src/engine/audit/wires.ts:auditWires` | ✅ |
| C3 a cross-currency payment is two amounts and a rate | `src/engine/simulation/stages/fx-funding.ts:fundForeignCurrencyShortfalls` | ✅ |
| C4 the money creators are enumerable and few | `src/engine/ledger/party.ts:PARTY_KINDS` | ✅ |
| C4.a a bank writing a loan creates a deposit | `src/engine/ledger/accounts.ts:creditCreatedByBank` | ✅ |
| C4.b the central bank creates reserves | `src/engine/ledger/accounts.ts:centralBankIssuanceLocal` | ✅ |
| C4.c VERIFY Δ money stock = C4.a + C4.b and nothing else | `src/engine/audit/money.ts:m6` | ⚠️ |
| D1 every asset move is a numbered instruction | `src/engine/ledger/wire.ts:WireInstruction` | ✅ |
| D1.a numbered, so a position can be replayed | `src/engine/ledger/wire.ts:wirePush` | ✅ |
| D1.b a residual is a missing wire | `src/engine/ledger/wire.ts:summarizeWires` | ✅ |
| D2 money is an asset like any other | `src/engine/ledger/wire.ts:MONEY_ASSET_ID_BY_CURRENCY` | ✅ |
| D3 VERIFY Σ(wires in) − Σ(wires out) = Δ holdings | `src/engine/audit/wires.ts:auditWires` | ✅ |
| **D4 FORBID no move without a wire** | `src/engine/ledger/wire.ts:activeWireJournal` | ✅ |
| **E1 a payer that cannot pay is a real state** | — | ❌ |
| E1.a it does not silently not happen or silently overdraw | `src/engine/simulation/stages/overdraft-sweep.ts:runOverdraftSweep` | ⚠️ |
| E1.b the payee has a receivable that did not arrive | `src/engine/simulation/stages/trade-settlement.ts:runTradeSettlementStage` | ✅ |
| E2 settlement is final | `src/engine/simulation/stages/settlement.ts:journalAppendRow` | ✅ |
| E2.a an error is corrected by a new payment | `src/engine/simulation/stages/settlement.ts:pay` | ✅ |
| **E3 order matters within a pass, and the order is defined** | `src/engine/simulation/stages/settlement.ts:runSettlementStage` | ⚠️ |
| E4 a party that ceases to exist is settled or refused by name | `src/engine/ledger/accounts.ts:applySettledRow`, `src/engine/ledger/entity-index.ts:regionOfParty` | ✅ |
| F1 a statement per book, in that book's own money | `src/engine/simulation/stages/settlement.ts:SettlementReport` | ✅ |
| F1.a treasury, household, bank, pool statements | `src/engine/simulation/stages/settlement.ts:treasuryFlowsByRegion` | ✅ |
| **F1.b FORBID a per-book statement is never a sum across currencies** | `src/engine/simulation/stages/settlement.ts:grossByCurrency` | ✅ |
| F2 the gross and the net are both reported | `src/engine/simulation/stages/settlement.ts:grossLocal` | ✅ |
| F3 VERIFY the clearing house's residual is zero | `src/engine/simulation/stages/settlement.ts:clearingHouseResidualLocal` | ✅ |
| F4 VERIFY money on a holder with no account is counted | `src/engine/simulation/stages/settlement.ts:unresolvedLocal` | ✅ |

---

## 3. THE DIFF

The tree's own header says to judge this layer on D, E and F. **D is clean** — every asset move is
a numbered wire, `activeWireJournal()` throws when there is none, and W1–W5 reconcile the four
stores against the journal. **F is clean.** The findings are all in E, and they are one finding.

### ❌ E1 / ⚠️ E1.a / B3.a / B3.b — NOBODY CAN FAIL TO PAY, BECAUSE CREDIT IS UNCONDITIONAL

**Every payment path does go through `pay()`.** That half of the question is answered: the only
writes to `v2.accounts.balance` outside `accounts.ts` are the seed's (`initialization.ts:783`,
`close-seed.ts:69`), 02b's sub-dollar reserve rounding (`02b-bank-diversification.ts:376`) and the
player's own ticket (`trade.ts:90`); `pay`/`payByIds`/`journalPayment` are otherwise the sole
entry, and `journalPush` writes the wire before the row so a money row without a wire cannot
exist. Capital calls (`pe-lifecycle.ts:184`), variation margin
(`derivative-lifecycle.ts:143 payToB`) and every clearing fee (`book-settlement.ts:126`) are
ordinary `pay` calls today. The historical hole recorded in the plan is closed.

**What is not there is the refusal.** `applySettledRow` (accounts.ts:666) tests only that both
parties have rows; `side`/`leg` (accounts.ts:675, 690) then add the delta with **no balance test
anywhere**, so a payer with nothing pays anyway and the row goes negative. The close sweep
(`overdraft-sweep.ts`) converts every negative it finds into a facility draw, a prime-brokerage
draw or an SME facility draw — and none of the three can be refused: the fund's leg is written
whether or not it is inside its line (`overdraft-sweep.ts:86`, "past the line it is still
funded"), the pool's is split across the region's banks by market share with no test at all, and
the firm's revolver is created out of nothing at its house bank. A bank short of reserves reaches
`raiseCentralBankLoanUSD` (`bank-lending.ts:917`), which is still four lines and lends the
shortfall unconditionally.

So B3.c is genuinely satisfied — no negative is silent, every one has a named lender and a rate —
and B3.a's "credit **decision**" is not: there is no decision, there is a conversion. E1 has no
code at all, and the consequence is that **the liquidity dimension of this model has no failure
state.** A firm, a fund, a pool and a bank all pay whatever they owe forever.

Not itself a §3 step for the non-bank paths. The bank path is **Already §3 step 20-LLR**; the
firm/fund/pool paths **become a §3 step** (small: the sweep already knows the size and the lender,
what it lacks is a "no").

**Two corrections to 20-LLR's own text, from reading the code today.** (1) The step says the
facility carries "no penalty rate"; there is one — `CENTRAL_BANK_LOAN_PENALTY_BPS = 100` over
SRF, charged at `02b-bank-diversification.ts:464`. The three real constraints it lacks are
collateral, eligibility and a cap. (2) 20-LLR's reading of the auctions is confirmed
independently here: `unsoldStaysWithHolder: true` is set at 07b:482, 07c:504, 07d:440, 07e:456 and
07f:354/905, and the residual dealer is zero by construction on those books
(`financial-clearing-engine.ts:887`).

### E4 / C1.a — WHO A PARTY IS WAS ANSWERED IN THIRTY PLACES (§3.13-BOOK c-then-1)

Not a divergence in what E4 requires — the legs are settled or counted by name, and F4 catches the
rest — but in how many copies of "who is this" the answer was spread across. Measured before
`ledger/entity-index.ts` existed: **thirty index builds** over `companies` and
`institutionalEntities`, three of them inside `settlement.ts`, where the region switch behind
C2.a's interbank leg and F1.a's per-book statement was written **twice**, sixty lines apart, nine
identical cases each (`partyRegionOf` and an inline `regionOfParty`). One builder now, one switch,
and the memo policy stated once — memoised on the STATE in the audit, never in the engine, because
`08-company-fundamentals.ts:470` replaces companies in place at the same length.

Four things the collapse found by reading, none of them E4's own:

- **`bankByTicker` was four different filters.** `isBankEntity` alone (the audit's O4, stage 08's
  lanes), `bankBalanceSheet` alone (estate resolution), and live-sheet-and-active (`banksOf`, in
  settlement). All four were right for their site — an estate resolves a bank that has DIED — so
  the index carries no filter at all and each predicate now sits where it can be read.
- **The private-firm fold was always a no-op**, in three files. `context.ts:432` opens the week as
  `updatedCompanies: [...state.companies]` and every reassignment is a length-preserving `.map`,
  so `prevActivePrivateFirms` — a `state.companies` FILTER — is a strict subset and the
  `if (!has(id))` guard could not fire. Two are deleted here (`derivative-lifecycle.ts`); 07b and
  07d carry the third and fourth.
- **`DerivativeContract.referenceId` is four id spaces in one `string` field**, discriminated by
  `classId` alone: an entity id from the CDS book, a commodity id, a REGION from the FX forward,
  and `''` from the swap. See `the-derivative-layer`.
- **O3's fund-share line**, in `the-register`.

### ⚠️ E3 — "TWO INSTRUCTIONS THAT BOTH DRAW ON ONE BALANCE CANNOT BOTH SUCCEED BY LUCK"

They both succeed by construction. `runSettlementStage` walks the journal in emission order and
applies every due row; order therefore determines nothing, because no row can fail. The node's
requirement is not that the order be defined (it is — the journal's) but that ordering MATTER, and
it cannot while E1 is absent. Closes with E1.

### ⚠️ B1.b / C4.c — THE TWO MONEY IDENTITIES ARE CHECKED AT A PERCENTAGE

`audit/money.ts:170` fires M6 only when the unexplained change exceeds
`max(5e8, moneyBefore * 0.005)` — half a percent of the money stock, which on a stock of trillions
is billions of dollars of unexplained money creation per region per week, invisible. `m5`'s bank
identity is `max(1e7, assets * 2e-3)`. Rule 28 says a tolerance is float dust, never a percentage.

**Already §3 step 27** ("the audit measures what it claims — and its tolerances are float dust").
Recorded here as a second witness: it is the money family's own headline identity that the band
is hiding.

### ❌ A1.c — CURRENCY IN CIRCULATION DOES NOT EXIST

`close-seed.ts:83` sets `cb.currencyInCirculationUSD = 0` and `audit/money.ts:68` reports any
non-zero value as "a residual nobody issued". Nothing ever issues notes.

**OUT OF SCOPE**, and correctly so: every party in this world banks, so a bearer liability has no
holder to be a liability to. The node stays because the distinction matters — this is a deliberate
absence, not a missing mechanism, and a later cash-preferring household would need it.
