# SYSTEM: CROSS-BORDER

What happens when the two sides of a transaction are in different regions. It is not a market of
its own — it is a **property** that every other market can have, and it exists as a tree because
the things it forces (a currency decision, a foreign counterparty, a claim on a foreign issuer,
a balance that must add up across regions) are absent unless something insists on them.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT MAKES A TRANSACTION CROSS-BORDER
- **A1** REASON — the two named parties are in **different regions** (`the-seed.md` B3)
- **A2** REASON — so the transaction is in **one of two currencies, or a third**, and somebody has
  to decide which (`currency-and-fx.md` B)
  - A2.a and whoever is not in the invoice currency has an **FX exposure**, which it can hedge
    (`fx-forwards-and-xcs.md` D1) or carry
- **A3** REASON — the settlement crosses banking systems: a payment in a currency reaches an
  account in that currency, wherever the account holder is (`money-and-settlement.md` C)
- **A4** REASON — the counterparty is **foreign**, which is a real credit and legal difference

### B. TRADE IN GOODS
- **B1** REASON — a firm **buys from or sells to** a firm in another region (`goods.md`),
  because of price, availability or cost (`labour.md`, `commodities-spot.md`)
- **B2** REASON — the goods **move**, which costs money and takes time
  (`freight-and-logistics.md`)
- **B3** REASON — the price the buyer pays in its own money depends on the **exchange rate**, so a
  rate move changes real trade decisions
  - B3.a which is the expenditure-switching channel, and it must be a **consequence** of B1's
    decision facing a changed relative price, never an elasticity applied to a balance
- **B4** VERIFY — one region's exports are another's imports, unit for unit and party to party

### C. CROSS-BORDER FINANCE
- **C1** REASON — an investor **holds a foreign asset** (`equity.md`, `corporate-credit.md`,
  `sovereign-credit.md`) because of its return, and it is a claim on a foreign issuer
- **C2** REASON — a borrower **issues in a foreign currency** because the funding is cheaper or
  the buyer base is deeper — and it then owes a money it does not earn
  - C2.a which is the original-sin exposure, and it is a real solvency risk that a rate move
    triggers, not a translation adjustment
- **C3** REASON — a **bank funds in one currency and lends in another**
  (`banks-funding-and-liquidity.md` E, `currency-and-fx.md` B5), and it must square that daily
- **C4** REASON — a **direct investment** buys a firm outright (`m-and-a.md`,
  `private-equity.md`), which is a lasting claim
- **C5** REASON — every one of these produces **income flows across the border**: coupons,
  dividends, interest — paid to foreign holders in a currency

### D. THE BALANCE
- **D1** REASON — a region's **current account** is a read: goods and services plus income flows,
  computed from actual transactions
- **D2** REASON — its **financial account** is the other side: net acquisition of foreign claims
- **D3** VERIFY — D1 + D2 = 0 for each region **as a consequence** of every transaction having two
  sides, never as an identity imposed after the fact
  - D3.a a residual that has to be plugged is a transaction that lost a leg (`the-audit.md` B7)
- **D4** REASON — a deficit region must be **financed by somebody who chooses to finance it**, at
  a price — so the financing is a market outcome, and it can stop
- **D5** REASON — the accumulated position is a **stock of claims**, held by named parties, that
  revalues when rates and prices move (`currency-and-fx.md` D2)
- **D6** VERIFY — summing all regions gives zero in every category, because the world is closed

### E. WHAT IT FORCES ON EVERY OTHER TREE
- **E1** REASON — a **market must be able to have foreign participants** with foreign money, or it
  is a domestic market wearing a region label
- **E2** REASON — a **register must hold foreign issuers' instruments** for domestic holders
  (`the-register.md`)
- **E3** REASON — a **default must reach foreign holders** in proportion, like any other
  (`firm-birth-and-death.md` D3)
- **E4** REASON — a **central bank's actions reach other regions** through the rate and the
  currency (`the-central-bank.md`, `fx-spot.md` B)

### F. WHAT MUST NOT HAPPEN
- **F1** FORBID — **no region that is a closed box.** If every party trades only domestically,
  every node above is dead and FX exists only as a number
- **F2** FORBID — **no netting of cross-border flows into a regional aggregate.** The parties are
  named on both sides, or the loss chain in E3 cannot be traced
- **F3** FORBID — **no exogenous trade or capital-flow series.** Both are consequences of B1 and
  C1's decisions

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 the two parties are in different regions | `src/engine/simulation/stages/05-unit-bidding.ts:buyerRegionOfKey` | ✅ |
| A2 one of two currencies, or a third, and somebody decides | `src/domain/invoice-currency.ts:chooseInvoiceRegion` | ✅ |
| A2.a the party out of its own money has an FX exposure it can hedge | `src/engine/simulation/stages/derivative-markets/fx-forward.ts:corporateExposureByRegion` | ✅ |
| A3 the settlement crosses banking systems | `src/engine/simulation/stages/fx-funding.ts:fundForeignCurrencyShortfalls` | ✅ |
| A4 the counterparty is foreign — a real credit and legal difference | — | ❌ |
| B1 a firm buys from or sells to a firm in another region | `src/engine/simulation/stages/sourcing-intent.ts:computeSourcingIntent` | ✅ |
| B2 the goods move, which costs money and takes time | `src/engine/simulation/stages/freight-clearing.ts:runFreightClearingStage` | ✅ |
| B3 the price in the buyer's own money depends on the rate | `src/domain/currency.ts:convertLocal` | ✅ |
| B3.a expenditure switching as a consequence of B1 | `src/engine/simulation/stages/sourcing-intent.ts:expectedLandedCostByOrigin` | ✅ |
| B4 VERIFY one region's exports are another's imports, party to party | `src/engine/audit/accounts.ts:f3` | ⚠️ |
| C1 an investor holds a foreign asset | `src/domain/cross-border.ts:mandateWeightForIssuer` | ✅ |
| C2 a borrower issues in a foreign currency | `src/engine/ledger/accounts.ts:obligationCurrencyOf` | ❌ |
| C2.a the original-sin exposure, a real solvency risk | — | ❌ |
| C3 a bank funds in one currency and lends in another | `src/engine/simulation/stages/fx-squaring.ts:squareInterbankFxPositions` | ⚠️ |
| C4 a direct investment buys a firm outright | `src/engine/simulation/stages/foreign-direct-investment.ts:runForeignDirectInvestment` | ✅ |
| C5 income flows across the border | `src/engine/simulation/stages/shared-helpers.ts:applyHolderInterestAccruals` | ✅ |
| **D1 the current account is a read of actual transactions** | `src/domain/region-macro.ts:tradeBalance` | ❌ |
| **D2 the financial account is the other side** | — | ❌ |
| **D3 VERIFY D1 + D2 = 0 as a consequence** | — | ❌ |
| D3.a a residual that has to be plugged is a lost leg | `src/engine/simulation/stages/fx-clearing.ts:residualByPair` | ⚠️ |
| D4 a deficit is financed by somebody who chooses to, at a price | — | ❌ |
| D5 the accumulated position is a stock of claims that revalues | `src/engine/simulation/stages/fx-revaluation.ts:runFxRevaluationStage` | ⚠️ |
| D6 VERIFY summing all regions gives zero in every category | `src/engine/audit/money.ts:foreignOfficialClaimsUSD` | ⚠️ |
| E1 a market can have foreign participants with foreign money | `src/domain/cross-border.ts:HOME_BIAS_BY_ENTITY_TYPE` | ✅ |
| E2 the register holds foreign issuers' instruments | `src/engine/simulation/stages/holdings-store.ts:buildHoldingsStore` | ✅ |
| E3 a default reaches foreign holders in proportion | `src/engine/simulation/stages/estate-resolution.ts:distribute` | ✅ |
| E4 a central bank's actions reach other regions | `src/engine/macro/evolution.ts:evolveFxPair` | ⚠️ |
| **F1 FORBID no region that is a closed box** | `src/engine/simulation/stages/05-unit-bidding.ts:bilateralTradeWeeklyLocal` | ✅ |
| **F2 FORBID no netting of cross-border flows into a regional aggregate** | `src/engine/simulation/stages/06-fx-and-trade.ts:exportsWeeklyLocal` | ⚠️ |
| **F3 FORBID no exogenous trade or capital-flow series** | `src/engine/simulation/stages/06-fx-and-trade.ts:runFxAndTradeStage` | ✅ |

---

## 3. THE DIFF

### ❌ D1 / D2 / D3 / D4 — THERE IS NO BALANCE OF PAYMENTS. THE CURRENT ACCOUNT IS THE LITERAL ZERO IT WAS SEEDED WITH

`currentAccountPctGdp` had four lines and no writer — seeded 0, typed, rendered twice — and was
**deleted 2026-09-05 (§9.15-iii)**; the surface now shows `tradeBalance` (exports − imports off real
fills, `06-fx-and-trade.ts`) as a share of GDP, which is the one external read that exists. D1 is
still ❌: a current account is that plus the income account, and nothing computes it.

It is set to `0` at the seed, never touched by any stage, and rendered on two screens. There is no
financial account at all — no field, no computation — so D3's identity has nothing to be an
identity between, and D4's "somebody chooses to finance the deficit, at a price" has no deficit to
finance.

**This is the tree's whole point and it is the reason this is the top finding, not a display bug.**
§3 step 15 lists *"`macro.tsx:63` reports a permanent 0.0% current account"* among a run of UI unit
errors (a `$2` move printed as `200.0%`, home ownership as `0.6%`). It is not the same kind of
thing: the other entries render a real number wrongly, this one renders a number nobody computes.
Fixing the formatter would print `0.0%` in a different font. Rule 12 — **fix the cause** — and the
cause is that the model has no external accounts.

The ingredients are all present and none of them are joined up. Goods: `reg.exportsLocal` /
`reg.importsLocal`, summed from real fills (`06-fx-and-trade:70-77`). Income: coupons and dividends
already reach foreign holders through `applyHolderInterestAccruals` and the register, and the payer
and payee both carry a region. Financial account: `fx-clearing.ts:100` already computes each
entity's **change in foreign holdings by issuer region** off `priorForeignHoldingsByRegion` — that
is the net acquisition of foreign claims, per party, per region, already in the code, used only to
generate FX orders and never summed into an account. So D1 and D2 are a read over things that exist,
and D3 then becomes checkable rather than imposed, which is exactly the node's demand.

**§3 step 37-BOP**, medium: two reads and one audit check, made possible
by 13c-FX-2 having put real two-sided flows underneath them.

### ❌ C2 / C2.a — NOTHING IS ISSUED IN A FOREIGN CURRENCY, SO ORIGINAL SIN CANNOT EXIST

`grep -i currency src/engine2/tranches.ts` → nothing. A tranche has no denomination; its money is
read off its owner (`obligationCurrencyOf`) or off the market that trades it. Every clearing book
runs in the money of the region that runs it. So the one thing C2 describes — a borrower that
raises money it does not earn, and is made insolvent by a rate move rather than translated by one —
has no representation, and C2.a's solvency channel with it.

**Already §3 step 13c** — its remaining bullets name both halves: *"clearing — an instrument's
quote currency. Every book still clears in the money of the region that runs it"* and *"the
contracts with no denomination … `TradeInvoice` is the one obligation in the model that already
carries its own denomination, and it is the shape the other three want."* Recorded here as the
demand-side reason 13c's tail matters: cross-border finance is a currency decision by the ISSUER,
and today only the goods invoice gets to make one.

### ⚠️ F2 / ✅ F3 — THE TRADE AGGREGATE SURVIVED, IN THE PLACE WHERE IT IS LEGITIMATE

§9.13c-FX-2 records `ctx.bilateralTradeWeeklyLocal` as deleted. **It was not deleted; it was removed
from `fx-clearing`**, which is the removal that mattered. It still exists at `context.ts:271,435`,
is zeroed each week at `05-unit-bidding:2457`, and is accumulated at `05-unit-bidding:1786` — one
`+=` per FILL, keyed `[lot.sellerRegion][buyerRegion]`, converted at the buyer's rate. Then
`06-fx-and-trade:70-77` sums it into `reg.exportsLocal` / `importsLocal` / `tradeBalance`.

That is the correct direction of travel and **F3 holds**: the series is a report of settled
transactions, not an input. `fx-clearing.ts:111` carries the tombstone — *"This was
`ctx.bilateralTradeWeeklyLocal[exporter][importer]` — a derived aggregate standing in for"* orders
nobody places — and the FX book now reads the desks' real positions instead.

F2 is `⚠️` and not `✅` for one reason: the aggregate is the only surviving representation of the
flow, so a consumer that wants the parties has to go back to stage 05 and re-derive them. That is
fine for a published statistic and wrong for the current account, which is why D1 must be built
from the fills and the register rather than from this matrix. No step: it is a note on how D1
should be built. **Also worth correcting in §9** — the log says the aggregate is gone and it is
not; the sentence is true only of `fx-clearing`.

### ⚠️ D3.a / D5 / D6 — THE PLUG IS NAMED, MEASURED, AND STILL DRIFTING

D3.a asks whether a residual has to be plugged. `fx-clearing.ts` publishes `residualByPair` — the
share of a pair's own flow the market could not absorb — and `invoice-currency.ts:exposureCost`
reads it as the depth signal that picks the invoice currency, which is a genuinely good use of it.
But §3 13c-FX-3 records what it is: a persistent ONE-WAY net flow the elastic side cannot take,
with the desks' book at −45.8B in week 1 and −181.3B by week 16. **Already §3 step 13c-FX-3**, which
also gives the three candidate causes and the instruction to measure before touching any. This
tree's contribution is to say which of the three D3/D4 predict: a persistent trade imbalance that
something real should be financing is a **capital account**, and the model has no place to put one
— so the flow has nowhere to go but the dealers' book, which is where it is.

D5 is `⚠️` for a related reason. `fx-revaluation.ts` genuinely revalues held foreign balances as a
mark (§9.13c-REVAL), so a **money** balance revalues. A foreign *claim* — a bond or an equity held
by a foreign investor — does not revalue for the currency, because it has no currency of its own to
revalue from (C2's absence). So D5 covers cash and not the stock of claims the node means.

D6 is `⚠️`: the only world-closes-to-zero check is `audit/money.ts:57` on central banks'
`foreignOfficialClaimsUSD`. There is no check on private claims, on income flows, or on the
financial account, because there is nothing to check.

### ⚠️ B4 — THE ONE CROSS-BORDER VERIFY IS TAUTOLOGICAL AND ITS TOLERANCE IS A PERCENTAGE

`audit/accounts.ts:f3` compares world exports to world imports. Both come from the same
`bilateralTradeWeeklyLocal` matrix summed along different axes, so it is true by construction and can
only fire on a NaN. B4 asks for something stronger — party to party, unit for unit — which would be
a real check against the fills.

While here: the tolerance is `exports * 0.05`, a **5% band**, which is rule 7's forbidden shape
(*"a tolerance is float dust, never a percentage"*) in the audit itself. A check that permits a 5%
discrepancy between world exports and world imports would not notice a whole region's trade going
missing. Small, and it belongs with **§3 step 27** (the audit's tolerances); recorded here because
this tree is where it does the damage.

### ❌ A4 — A FOREIGN COUNTERPARTY IS NOT DIFFERENT FROM A DOMESTIC ONE

Nothing in the model treats a cross-border claim as carrying any credit or legal difference: no
withholding, no country ceiling on a rating, no transfer risk, no difference in an estate's
treatment of a foreign claimant. `grep -i "withholding|countryRisk|sovereignCeiling"` over `src/`
finds one comment about domestic payroll withholding.

E3 is `✅` and that is what makes A4's absence coherent rather than accidental: `estate-resolution`
distributes to whoever holds the row, foreign or not, in proportion — a foreign holder is treated
*exactly* like a domestic one, which is the right default and is precisely the thing A4 says is not
quite true in the world. Marked MISSING rather than OUT OF SCOPE: the model has ratings
(`ratings-and-assessment.md`) and estates, so the node is expressible; nobody has decided against
it. Small, and low priority against D1.

### ✅ WHAT THIS TREE FOUND WORKING

Worth stating, because the interesting half of cross-border is in good shape and the findings above
all sit downstream of it. **A2/A2.a**: `invoice-currency.ts` decides the invoice currency from
measured pair depth and measured market power, with a vehicle currency possible rather than
assumed — a mechanism, not a scoring formula, and its header says why. **A3**:
`fx-funding.ts:fundForeignCurrencyShortfalls` makes a party short of a money BUY it, from a named
desk, at a spread, in the same settlement pass — which is what makes a per-currency account
meaningful. **B1/B3.a**: `computeSourcingIntent`'s merit order over `expectedLandedCostByOrigin` is
expenditure switching as a consequence of a real comparison, never an elasticity. **C4**:
`runForeignDirectInvestment` builds abroad when a year of merit orders says exporting has stopped
working, funds it out of the parent's own cash through the FX path, and uses the ordinary birth
machinery. **F1** is not close to failing: cross-border fills, foreign holdings, FDI subsidiaries
and interbank FX squaring all exist.

### Also marked, briefly

- **C3 ⚠️** — a bank's cross-currency mismatch is squared spot-for-spot each week; no term funding in another money exists — `fx-forwards-and-xcs.md` A4/D3.
- **E4 ⚠️** — a central bank reaches other regions only through the cleared rate; `evolveFxPair`'s basis walk is the one formula channel left — 37-SMALL.
