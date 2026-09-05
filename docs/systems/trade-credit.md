# SYSTEM: TRADE CREDIT

Firms buying from each other and paying later. It is the largest source of short-term finance in
any real economy, it is invisible in a model where every sale settles instantly, and it is the
channel by which one firm's failure becomes another firm's loss without a bank in between.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT IT IS
- **A1** REASON — a **sale delivered now and paid later**: the seller has a **receivable**, the
  buyer a **payable**, and they are the same obligation from two sides (rule 4)
- **A2** REASON — both sit on real balance sheets (`firm-fundamentals.md` C1, C2)
- **A3** REASON — it has **terms**: how long, and often a discount for paying early — which makes
  the discount an **implicit interest rate** and therefore a price
- **A4** REASON — it is **unsecured credit extended by a supplier**, and the supplier decided to
  extend it

### B. WHY IT EXISTS
- **B1** REASON — the **buyer needs to sell what it bought before it can pay**, and the terms
  bridge that gap (`firm-fundamentals.md` C4)
- **B2** REASON — the **seller wants the sale**, and offering terms is a way to compete
- **B3** REASON — the seller often **knows the buyer better than a bank does**, and can enforce
  better by threatening to stop shipping
- **B4** REASON — it is **cheap or free at the point of use**, which is why firms use it first and
  bank credit second (`banks-lending.md`)
- **B5** REASON — the seller **decides** whether to offer it, per buyer, on the buyer's condition
  — and it tightens terms when it is worried, which is a real credit tightening with no bank
  involved

### C. THE FLOW
- **C1** REASON — the goods move at one time (`goods.md`), the money at another
  (`money-and-settlement.md`)
  - C1.a so revenue and cash receipt are **different weeks**, and that difference is
    `firm-fundamentals.md` C4.a
- **C2** REASON — the receivable is an **asset that can be financed**: pledged, factored, or sold
  to a bank at a discount — which turns it into bank credit
- **C3** REASON — payment, when it comes, is a **real settlement between two named parties**
- **C4** VERIFY — Σ receivables = Σ payables, across the whole world, exactly. This is the
  cheapest possible check on the system existing at all

### D. FAILURE — WHY IT MATTERS
- **D1** REASON — a buyer can **pay late**, and lateness is a real state that stresses the seller's
  cash
- **D2** REASON — a buyer can **fail**, and then the receivable is a **claim in the estate**,
  ranking with other unsecured creditors (`firm-birth-and-death.md` D2)
  - D2.a so the seller takes a real loss it did not choose, from a party it is not a lender to on
    paper
- **D3** REASON — the loss can **push the seller into distress**, and its own suppliers then take
  losses — a chain that runs along the supply network and not through the banking system
  - D3.a VERIFY — this contagion path must be **emergent from D2**, traceable firm to firm
- **D4** REASON — the anticipation of D2 makes suppliers **withdraw terms** from a firm they doubt
  (B5), which starves it of working capital faster than any lender could
  - D4.a which is how a solvent firm dies of a rumour, and it is a real mechanism

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no sale that settles instantly by construction.** If every transaction pays on
  delivery, this entire system is absent and its failure channel with it
- **E2** FORBID — **no receivable without a named payer** (`the-register.md` A3)
- **E3** FORBID — **no receivable that survives its debtor's death.** It resolves into a recovery
  or a loss (`firm-birth-and-death.md` E2)

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

**This system EXISTS.** That is the first finding, and it is the opposite of the one the plan
expected (§3 step 37 lists trade credit among "the trees whose systems the code may not have at
all"). Every B2B sale between two named firms — domestic and cross-border — is delivered now and
paid later, on terms struck from the buyer's own default probability and the seller's own funding,
with a real cash leg both ways. What is missing is the price, the seller's option to refuse, and the
supplier's place in the estate.

| Node | Code | |
|---|---|---|
| A1 delivered now, paid later; a receivable and a payable | `src/engine/simulation/stages/05-unit-bidding.ts:tradeInvoicesBooked` · `src/engine2/obligations.ts:writeInvoiceRow` · `src/engine/ledger/contract-ledger.ts:tradeInvoicesOf` | ✅ |
| A2 both sit on real balance sheets | `src/engine/companyGenerator.ts:accountsReceivable` | ⚠️ |
| **A3 terms, and a discount that is an implicit interest rate** | `src/domain/trade-invoice.ts:paymentTermWeeks` | ⚠️ |
| A4 unsecured credit the supplier decided to extend | `src/domain/trade-invoice.ts:creditAffordableWeeks` | ✅ |
| B1 the terms bridge the buyer's own cash gap | `src/domain/trade-invoice.ts:TradeInvoice` | ✅ |
| **B2 offering terms is a way to compete for the sale** | — | ❌ |
| **B3 the seller enforces by threatening to stop shipping** | — | ❌ |
| B4 cheap or free at the point of use | `src/domain/trade-invoice.ts:paymentTermWeeks` | ⚠️ |
| B5 the seller decides per buyer, and tightens when worried | `src/domain/trade-invoice.ts:expectedLossPerWeek` | ✅ |
| C1 goods move at one time, money at another | `src/engine/simulation/stages/trade-settlement.ts:runTradeSettlementStage` | ✅ |
| C1.a revenue and cash receipt are different weeks | `src/engine/simulation/stages/05-unit-bidding.ts:deferredSaleKeyed` | ✅ |
| **C2 the receivable can be pledged, factored or sold** | — | ❌ |
| C3 payment is a real settlement between named parties | `src/engine/simulation/stages/05-unit-bidding.ts:R_TRADE_CREDIT` | ✅ |
| **C4 Σ receivables = Σ payables, across the world** | — | ❌ |
| **D1 a buyer can pay late, and lateness is a state** | — | ❌ |
| **D2 a failed buyer's receivable is a claim in the estate** | `src/engine/simulation/stages/estate-resolution.ts:openEstate` | ❌ |
| D2.a the seller takes a real loss it did not choose | `src/engine/simulation/stages/trade-settlement.ts:tradeInvoiceWriteOffLocal` | ✅ |
| D3 the loss can push the seller into distress | `src/engine/simulation/stages/trade-settlement.ts:activeById` | ✅ |
| **D3.a the contagion path is traceable firm to firm** | — | ❌ |
| D4 anticipation makes suppliers withdraw terms | `src/domain/trade-invoice.ts:lossGivenDefault` | ⚠️ |
| **D4.a a solvent firm can die of a rumour** | — | ❌ |
| E1 FORBID no sale that settles instantly by construction | `src/engine/simulation/stages/05-unit-bidding.ts:isDomestic` | ⚠️ |
| E2 FORBID no receivable without a named payer | `src/domain/trade-invoice.ts:TradeInvoice` | ✅ |
| E3 FORBID no receivable that survives its debtor's death | `src/engine/simulation/stages/trade-settlement.ts:activeById` | ✅ |

---

## 3. THE DIFF

### ❌ D2 — TRADE CREDITORS RANK NOWHERE IN AN ESTATE, AND THE ESTATE COUNTS ONLY ONE SIDE OF THE BOOK

The single most consequential finding in this tree, and it is a conservation defect as well as a
missing mechanism.

`trade-settlement.ts:53`, when an invoice comes due and its buyer is not active:

```
if (!activeById.get(invoice.buyerId)) { ctx.tradeInvoiceWriteOffLocal += bookedLocal; return; }
```

The receivable is written off in full. It never becomes a claim, because `openEstate`
(`estate-resolution.ts:513-586`) builds its claim list from exactly two sources — institutional
holdings rows and bank facility rows on the dead firm's ladder — and **trade payables are neither**.
So an unsecured supplier recovers **zero by construction** while an unsecured bondholder recovers
whatever the waterfall reaches, which is the opposite of the ranking D2 states (`bond.md` N13.a:
they rank together).

The asymmetry runs the other way too, and it is worse: the estate's ASSET side *does* count
receivables — `estate-resolution.ts:190` sums the dead firm's whole invoice book as an asset and its
buyers really pay onto its account. So a failed firm collects everything owed **to** it and pays
nothing it owes **for goods**. Its financial creditors are therefore paid out of money that in a real
workout would have gone pari passu to its suppliers, and the realised recovery rate
(`realisedDebtRecoveryRate`, which feeds back and calibrates every priced recovery in the model) is
**biased high by exactly the omitted trade payables**.

**§3 step 37-ESTATE**, and it is not large: `openEstate` needs a third claim source
(the invoice book keyed by `buyerId`), and `trade-settlement` needs to file rather than write
off.

### ❌ C2 / ⚠️ A3 / B4 — TRADE CREDIT HAS NO PRICE

`paymentTermWeeks` returns a NUMBER OF WEEKS and nothing else. There is no 2/10-net-30, no early-
payment discount, no late-payment charge — so the implicit interest rate A3 names does not exist,
and the largest source of short-term finance in this economy is **free**. That has three
consequences the tree cares about:

- B4 is satisfied only by accident. Firms use trade credit before bank credit because it costs
  nothing, not because it is cheaper than the alternative — so the *substitution* between supplier
  credit and bank credit, which is what makes B4 matter, cannot respond to a policy rate.
- The seller is lending at zero. `paymentTermWeeks` sizes the term so the seller's *margin* covers
  the expected loss — a careful and genuinely good piece of reasoning (`creditAffordableWeeks`) —
  but the seller is then compensated for the credit out of a margin it would have earned anyway.
- C2 is empty. A receivable with no rate has nothing to discount, so it cannot be factored, pledged
  or sold to a bank; `grep`ing `src` for factoring or receivable finance returns nothing. The bridge
  from trade credit into bank credit does not exist.

**§3 step 37-TRADECREDIT**, . The rate is already derivable from what the file computes: the seller's
expected loss over the term *is* the price it should be charging.

### ❌ B2 / B3 / D4.a — TERMS ARE A FORMULA, NOT A DECISION, AND THEY CANNOT BE WITHDRAWN

`return Number.isFinite(weeks) ? Math.max(1, Math.floor(weeks)) : 1;`

Every sale to a named buyer gets at least one week of credit, whatever the buyer's condition. So:

- **B5 is real** — the term genuinely shortens as `buyerAnnualDefaultProbability` rises and as the
  seller's own cash falls, which is a credit tightening with no bank in it, and it is the best thing
  in this system.
- **D4 is bounded** — terms shrink toward one week and stop. A supplier cannot refuse to ship on
  credit, so D4.a's mechanism (a solvent firm starved of working capital by suppliers who doubt it)
  cannot happen, and neither can B3's enforcement threat.
- **B2 is absent** — the buyer's sourcing decision (`05-unit-bidding`'s merit order on landed cost
  and `deliveryReliability`) does not read terms at all, so offering better terms wins no business
  and terms are not a competitive instrument.

**§3 step 37-TRADECREDIT**, together with A3's price: once terms have a price, offering them is a bid and
refusing them is a decision.

### ❌ C4 — THE CHEAPEST CHECK IN THE SYSTEM IS NOT TAKEN

Nothing anywhere sums receivables against payables. The identity holds trivially inside
the invoice book (`contract-ledger.ts:tradeInvoicesOf`, one row per obligation, read from both sides), which is the right
representation — but it does **not** hold against the balance sheets the model reports, because
those carry `annualRevenue × 0.08 × {0.6, 0.4}` instead (see A2 below). So the world has two
receivable books, one real and one stated, and the check that would have exposed that in one line
has never been run. **A measurement, for §3 step 38** — and it should be added to `the-audit.md`'s
families, not just to the standing reads.

### ⚠️ A2 — THE REPORTED BALANCE SHEET DOES NOT SHOW THE REAL INVOICE BOOK

`companyGenerator.ts:231-233` puts every firm's receivables at 4.8% of revenue and payables at 3.2%,
for ever. The real book is the contract store's (`tradeInvoicesOf`). Two representations of one quantity (rule 4), and
the stated one is what the player sees and what `changeInWorkingCapital` is computed from. Recorded
in full in `firm-fundamentals.md` C1's diff; **the same §3 step** closes both.

### ⚠️ E1 — THE SME TIER PAYS CASH, AND IT IS THE TIER THAT LIVES ON TRADE CREDIT

`05-unit-bidding.ts:2044`:

```
const seller = lookup.byTicker.get(l.sellerKey);
if (!seller) return;
```

An SME pool sells as a `SEGMENT` party, so it has no ticker in that map and **no invoice is booked**:
every sale by a pool settles instantly. Household and government purchases settling instantly is
correct (they are not trade credit); the pool exclusion is not. In reality the small-firm tier is the
most trade-credit-dependent part of an economy in both directions, and `sme-pools.md` A4 says so
explicitly. Today a pool's receivables are zero, so `D3`'s contagion chain stops dead the moment it
reaches the small tier — which is where a real one accelerates.

**§3 step 37-TRADECREDIT**, and it is naturally part of `sme-pools.md`'s resolution question: what the
pool can owe and be owed depends on what a pool IS.

### ❌ D1 / D3.a — LATENESS DOES NOT EXIST, AND THE CHAIN IS NOT TRACED

An invoice settles in full on `weekDue` or its buyer is dead. There is no partial payment, no
extension, no arrears state — so the observable that precedes a supplier's loss, and the one a real
credit manager actually watches, is absent. D3's contagion IS emergent and real (the write-off is
cash the seller genuinely lent and never gets back, and it can push the seller through its own
default trigger), but `tradeInvoiceWriteOffLocal` is a single world-level scalar: nothing records which
seller lost how much to which buyer, so D3.a's "traceable firm to firm" cannot be checked. The
mechanism is right and the instrument to see it is missing. D1 is **§3 step 37-TRADECREDIT**; D3.a is
**a measurement, for §3 step 38**.

### ✅ What is genuinely here

A1, A4, B1, B5, C1, C1.a, C3, E2, E3. The goods move on the auction's week and the money on the
invoice's; the buyer pays ex-works and the seller hands it straight back as the credit it agreed to
extend, both legs between named accounts (`R_TRADE_CREDIT`), so the receivable is real money really
lent. The term is derived from the buyer's own structural PD, the model's own recovery rate and the
seller's own margin and cash — no `net 30 / net 60` table anywhere. A dead buyer's invoice resolves
rather than surviving. That is a real trade-credit system, and the diff above is what it still owes.
