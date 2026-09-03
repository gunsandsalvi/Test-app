# SYSTEM: HEDGE FUNDS

Leveraged, mandate-light, marked-to-market investors. They matter for three structural reasons:
they are the marginal buyer in stressed markets, they are the reason `prime-brokerage.md` exists,
and their forced deleveraging is one of the few mechanisms in this world that turns a price move
into more price moves.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT THEY ARE
- **A1** REASON — a **named party** with investors, a register of holdings, and accounts
- **A2** REASON — **investor capital is equity**: the investors bear the result
  (`fund-shares.md` A3)
- **A3** REASON — a **manager** is a separate party earning a fee — a management fee on assets and
  a **performance fee on gains**, and the asymmetry of that second fee is a reason for risk-taking
- **A4** REASON — a **mandate that is wide**: it can be long, short, levered, and in many markets
- **A5** REASON — everything is **marked to market** at cleared prices, so its equity moves daily

### B. LEVERAGE
- **B1** REASON — it **borrows to hold more than its equity**, from a named lender
  (`prime-brokerage.md` B1)
  - B1.a leverage is therefore **a fact about a loan**, never a property of the fund
- **B2** REASON — it also levers **through derivatives**, where the notional exceeds the margin
  (`the-derivative-layer.md`, `../instruments/derivative.md` D2.a)
- **B3** REASON — and through **repo** (`money-market.md`) against the securities it holds
- **B4** REASON — the amount available is the **lender's decision**, and it changes
  (`prime-brokerage.md` C4)
- **B5** VERIFY — gross exposure, net exposure and equity are three different reads and all three
  are needed; a single "leverage" number hides which one moved

### C. WHAT IT DOES IN A MARKET
- **C1** REASON — it takes **positions for reasons**: a relative-value view, a directional view, a
  liquidity premium it is paid to hold
- **C2** REASON — it will be the **buyer when others are forced sellers**, if it has capacity —
  which makes it a genuine participant in `the-clearing-engine.md`, with a limit like everyone else
- **C3** REASON — it **shorts**, which requires a borrow (`securities-lending.md` E1)
- **C4** REASON — its trades are **real trades with real counterparties** at cleared prices

### D. THE FAILURE MODE
- **D1** REASON — a **loss reduces equity**, and with fixed borrowing, leverage rises
- **D2** REASON — the lender **calls margin** (`prime-brokerage.md` C2)
- **D3** REASON — meeting the call requires **selling**, at market prices, which moves prices
- **D4** REASON — the price move hits **other holders of the same positions**, who may be levered
  too — and D1 starts again for them
  - D4.a this loop is the mechanism, and it must be **emergent from D1–D3**, never a contagion
    parameter (`README.md`, REASON not OUTCOME)
- **D5** REASON — **investor redemptions** arrive at the same time, for the same reason, and they
  are a second forced-seller channel (`fund-shares.md` C2.b)
  - D5.a a **redemption gate or notice period** delays it, which is a real contractual term with
    real consequences for who gets out
- **D6** REASON — the fund can **fail**, and then its broker eats the shortfall
  (`prime-brokerage.md` D2) and its investors lose their equity
- **D7** VERIFY — the chain from one fund's loss to another fund's margin call must be traceable
  through prices and named counterparties

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no leverage without a lender** (B1.a)
- **E2** FORBID — **no position that does not mark.** A fund carrying an unmarked position has
  hidden its own equity from itself
- **E3** FORBID — **no fund that cannot fail.** A vehicle that absorbs losses indefinitely is the
  buyer of last resort in a different costume (`the-clearing-engine.md` B4)

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a named party with investors, a register and accounts | `src/domain/institutions.ts:InstitutionalEntity` | ✅ |
| **A2 investor capital is equity: the investors bear the result** | `src/engine/simulation/stages/household-balance-sheet.ts:beneficiaryLiabilityUSD` | ⚠️ |
| A3 a manager on a management fee and a performance fee | `src/engine/simulation/stages/profiles/asset-manager.ts:managementFeeRate` | ⚠️ |
| A4 a wide mandate: long, short, levered, many markets | `src/domain/institution-profiles.ts:HEDGE_FUND_STRATEGY_PROFILES` | ✅ |
| A5 everything marked to market, so its equity moves | `src/engine/simulation/stages/institutional-balance-sheet.ts:institutionTotalAssetsUSD` | ✅ |
| B1 it borrows from a named lender | `src/domain/prime-brokerage.ts:PrimeBrokerageLine` | ✅ |
| **B1.a leverage is a fact about a LOAN, never a property of the fund** | `src/domain/institution-profiles.ts:leverage` | ✅ |
| B2 it also levers through derivatives | `src/engine/simulation/stages/derivative-markets/commodity-future.ts:capacityUSD` | ⚠️ |
| **B3 and through repo, against the securities it holds** | — | ❌ |
| B4 the amount available is the lender's decision, and it changes | `src/engine/simulation/stages/prime-brokerage.ts:lineUSD` | ✅ |
| B5 VERIFY gross, net and equity are three different reads | — | ❌ |
| C1 it takes positions for reasons | `src/engine/simulation/stages/asset-allocation.ts:computeReservationSpreadBps` | ✅ |
| C2 the buyer when others are forced sellers, with a limit | `src/domain/institution-profiles.ts:convictionMultiple` | ✅ |
| C3 it shorts, which requires a borrow | `src/domain/securities-lending.ts:shortSizeShares` | ✅ |
| C4 real trades with real counterparties at cleared prices | `src/engine/simulation/stages/book-settlement.ts:settleClearedBook` | ✅ |
| D1 a loss reduces equity and leverage rises | `src/domain/prime-brokerage.ts:maxDrawnUSD` | ✅ |
| D2 the lender calls margin | `src/engine/simulation/stages/prime-brokerage.ts:targetDrawnUSD` | ✅ |
| **D3 meeting the call requires SELLING, which moves prices** | `src/engine/simulation/stages/overdraft-sweep.ts:withinLineUSD` | ❌ |
| D4 the price move hits other levered holders of the same positions | `src/engine/simulation/stages/financial-clearing-engine.ts:clearFinancialAsset` | ⚠️ |
| D4.a the loop must be emergent, never a contagion parameter | `src/engine/simulation/stages/financial-clearing-engine.ts:clearFinancialAsset` | ✅ |
| **D5 investor redemptions arrive at the same time** | — | ❌ |
| D5.a a gate or notice period | — | ❌ |
| **D6 the fund can fail; the broker eats the shortfall** | — | ❌ |
| D7 VERIFY the chain from one fund's loss to another's call | — | ❌ |
| E1 FORBID no leverage without a lender | `src/domain/institution-profiles.ts:leverage` | ✅ |
| E2 FORBID no position that does not mark | `src/engine/simulation/stages/institutional-balance-sheet.ts:institutionBookUSD` | ✅ |
| **E3 FORBID no fund that cannot fail** | `src/domain/institutions.ts:isDefaulted` | ❌ |

Counts: 15 `✅` · 4 `⚠️` · 8 `❌`.

---

## 3. THE DIFF

### ✅ B1.a — THE ONE THING THIS TREE MOST NEEDED IS RIGHT

Checked directly, because it is the node the whole system hangs on. **A fund's leverage is a
borrowing, not a field.** `LEVERAGE_ALLOWANCE.HEDGE_FUND` — a constant share of assets a fund was
simply allowed to borrow from nobody — is gone; `domain/prime-brokerage.ts` replaced it with a
`PrimeBrokerageLine` carrying `brokerTicker`, `fundId`, `drawnUSD`, `haircutRate`, `rateAnnual`,
and the amount is `maxDrawnUSD(fundEquity, haircut) = E × (1/h − 1)` bounded by the broker's own
`leverageHeadroomUSD`. The registry's `leverage: 'PRIME_BROKERAGE'` is a fact about the KIND (which
lender it borrows from), not a quantity. `primeBrokerageAvailableUSD` is a field on the entity, but
it is a cached read of the line struck this week, written only by the prime-brokerage stage. E1
holds for the same reason.

The whole of B and D1–D2 follows from that and is present. What fails is everything downstream of
the call, and it fails at one place.

### ❌ D3 / D6 / E3 — A HEDGE FUND CANNOT SELL UNDER PRESSURE AND CANNOT FAIL

Three nodes, one cause, and it is this tree's entire failure mode.

**E3 first, because it is the simplest fact in these six trees.**
`InstitutionalEntity.isDefaulted` is READ in sixteen places across the engine and the audit
(`repo-clearing:320`, `07f:697`, `pe-lifecycle:249`, `securities-lending:381`,
`etf-flows:117`, `prime-brokerage:94`, `overdraft-sweep:73`, `ownership.ts:41`, …) and **written
in exactly one: the seed.** `bank-resolution.ts:224` sets `bank.isDefaulted` on a COMPANY;
`stage08-back.ts:2382` sets it on a company; nothing anywhere sets it on an
`InstitutionalEntity`. Every hedge fund, every insurer, every pension fund, every money fund and
every sponsor in this world is immortal by construction. A vehicle that absorbs losses
indefinitely is exactly what E3 forbids.

**D3** is `prime-brokerage.md` C3/C3.a from this side: the call is paid in cash, the fund's
purchasing capacity is floored at zero rather than going negative
(`institutional-balance-sheet.ts:72`, whose own comment assumes the opposite), and any resulting
overdraft is re-lent by the same broker at the close (`overdraft-sweep.ts:77`). So a margin call
never makes a fund a seller; it makes it a non-buyer and then a costlier borrower. The one
deleveraging channel that does work is indirect: a fund's `institutionTotalAssetsUSD` falls with
its marks, which lowers `entityPoolUSD` and therefore its structural ceiling in the next
clearing session, so it sells some. That is a mark-driven rebalance, not a funded seller under an
obligation, and it is far slower than the thing D3 describes.

**D6** then has no code at all: no close-out, so no shortfall, so no loss on the broker's capital.
`banks-capital-and-resolution.md`'s bank cannot be hurt by a fund.

**Becomes a §3 step — the same one as `prime-brokerage.md` C3/D1**, and this tree is the second
witness. Sizing note that belongs here rather than there: `isDefaulted` is already read
everywhere an entity should stop participating, so the wind-up path is mostly wiring — an entity
whose equity is negative after a forced sale is marked, its book goes to
`estate-resolution.ts`'s waterfall (which already handles `PE_FUND_INTEREST` and `EQUITY` claims),
and its broker takes the residual.

### ⚠️ A2 — THE INVESTORS DO NOT BEAR THE RESULT; THE FUND'S OWN RESIDUAL DOES

`household-balance-sheet.ts:69-75`, for every kind whose `beneficiariesAreHouseholds` is true —
which includes `HEDGE_FUND`:

    const liabilityUSD = Math.max(0, openingUSD + Math.max(0, entity.lastWeeklyInvestmentIncomeUSD ?? 0));
    equityCapitalUSD: institutionTotalAssetsUSD(ctx, entity) - liabilityUSD,

The household claim is a **ratchet**. It grows by investment income, which is itself only bond
coupons (`equity.md` C4 — `accrueInstitutionalIncome` skips every `EQUITY` row), and the double
`Math.max(0, …)` means it never falls. So the investors' claim rises in a good week and does not
move in a bad one, and every mark-to-market loss lands in `equityCapitalUSD`, the fund's own
residual — which can go arbitrarily negative and has no consequence, because nothing reads it as
solvency.

That inverts A2 exactly: investor capital is supposed to be the equity that bears the result, and
here it behaves like senior debt while the fund's own (unowned, unfunded) capital is the buffer.
It also breaks the wealth channel the module exists for — a household's fund wealth cannot fall
when markets fall, which removes the largest real feedback from asset prices to consumption.

**Becomes a §3 step.** It is one expression: the claim is `totalAssets − whatever is genuinely
senior`, signed both ways, which is the same reversal the file already performed once for pension
entitlements. The `Math.max(0, …)` pair is the whole defect.

### ❌ D5 / D5.a — A HEDGE FUND HAS NO REDEEMABLE SHARE

The second forced-seller channel does not exist for this vehicle. A hedge fund's investors hold
`beneficiaryLiabilityUSD` — a scalar the household sector owns collectively — with no share
count, no subscription, no redemption request and therefore no gate or notice period. Nothing can
ask for its money back, which is why `fund-shares.md` C2.b and this node fail together: the ETF
redeems in kind and the hedge fund cannot be redeemed at all, so neither vehicle produces the
seller both trees are built around. **Becomes a §3 step**, and it should be the same step as
`fund-shares.md` C2.b's open-ended vehicle — one redeemable claim, used by both.

### ❌ B3 / B5 — NO REPO LEVERAGE, AND NO EXPOSURE READS

**B3**: institutions only ever LEND cash in the repo market. `repo-clearing.ts` builds its
borrower side from banks alone (`c.borrowerTicker` is a bank ticker throughout, capacity from
`unencumberedBorrowingCapacityUSD(sheet, …)` — a bank sheet), and an entity's participation is
`repoLentUSD`/`rrpLentUSD`, both assets. So a fund cannot finance a bond position in repo, which
removes the cheapest leverage in a real fund's toolkit and is also the missing demand side
§3 step 17e names for the basis trade. **Already §3 step 17e** in effect; worth recording there
that the blocker is entity-side repo BORROWING, not the future.

**B5**: nothing computes gross exposure, net exposure or a leverage ratio for a fund. The engine
carries `drawnByFund` (borrowings) and `institutionTotalAssetsUSD` (assets) and never divides
them, and the UI shows `equityCapitalUSD / totalAssets`. Since equity is the broken residual of
A2, even that read is not the one the node wants. **A measurement, for §3 step 38** — three reads
off numbers that already exist.

### ⚠️ A3 / B2 / D4 — THREE PRESENT-BUT-WRONG-SHAPE

**A3**: the manager exists as a separate listed company and charges
`managementFeeRate = 0.0225` for a hedge fund (`companyGenerator.ts:582`, a flattened "2-and-20"
whose own comment says so). Two divergences: there is **no performance fee**, so the asymmetric
incentive the node calls *"a reason for risk-taking"* is absent; and the fee is booked as the
manager's REVENUE (`asset-manager.ts:25-26`) with no payer — unlike the ETF expense ratio and the
money-fund fee, both of which are real `pay()` instructions. So the fund's cost of its manager is
not a flow. **Becomes a §3 step**, small, and it pairs with §3 step 31's "2-and-20" line in
`companyGenerator.ts:575`.

**B2**: derivative leverage is real (a future's notional against posted margin) but the SIZE is
`Math.max(0, fund.equityCapitalUSD) / FUTURES_TENOR_MONTHS.length` — the stale, broken residual
from A2 rather than the live `institutionTotalAssetsUSD`. Same for CDS (`cds.ts:159`). So the
derivative book is sized off a number that is wrong for the reason A2 is wrong.

**D4/D4.a**: the propagation is genuinely emergent — there is no contagion parameter anywhere in
`src`, prices move only through `clearFinancialAsset`, and a fund's marks move with them. What
makes D4 ⚠️ rather than ✅ is that the loop's second half (the price move producing MORE selling)
is severed at D3, so the chain runs one step and stops. D4.a is ✅ on its own terms: what exists is
emergent, and nothing shortcuts it.
