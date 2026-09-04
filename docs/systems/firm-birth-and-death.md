# SYSTEM: FIRM BIRTH AND DEATH

Entry and exit. A world where the same firms exist forever has no default risk that is ever
realised, no creative destruction, and a credit market pricing an event that cannot happen. This
tree is what must be true when a firm starts and when it stops.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. BIRTH
- **A1** REASON — a **new named party** appears, with an identity that is new and not reused
  (`the-register.md` F1)
- **A2** REASON — it is **funded by somebody**: founders' money, an investor, a lender — and the
  money comes out of a named account
  - A2.a FORBID — **no firm born with an endowment from nowhere** (`the-seed.md` A4)
- **A3** REASON — it starts with a **balance sheet that balances** and usually very little
- **A4** REASON — entry happens **for a reason**: profitability in a sector, available funding,
  demand not being met (`goods.md`)
  - A4.a so entry is a **consequence** of conditions, never a birth rate
- **A5** REASON — it enters a **market as a competitor**, which changes what incumbents face

### B. LIFE AND DISTRESS
- **B1** REASON — it is subject to `firm-fundamentals.md` like any other firm from the first week
- **B2** REASON — a young firm is **more fragile**: less cash, no track record, worse credit terms
  (`ratings-and-assessment.md`)
- **B3** REASON — distress is **observable before default**: coverage falling, cash falling,
  spreads widening (`firm-fundamentals.md` D3)
- **B4** REASON — a distressed firm **acts**: cuts costs, sells assets, raises expensive money,
  approaches its lenders — and each act is a real transaction

### C. DEFAULT
- **C1** REASON — a **stated, observable definition** — a payment missed, a covenant breached
  (`../instruments/bond.md` N12)
- **C2** REASON — it is a **consequence of the firm's state**, never a draw from a default
  probability
  - C2.a FORBID — **no exogenous default event.** A default assigned by a hazard rate cannot be
    prevented by a firm's actions or caused by a market's, which deletes B4 and every credit
    channel in this atlas
- **C3** REASON — it **triggers things**: `cds.md` D1, the lenders' loss
  (`banks-lending.md` E), a rating action (`ratings-and-assessment.md`)
- **C4** VERIFY — every default is traceable to the cash or solvency failure that caused it
  (`firm-fundamentals.md` D4)

### D. RESOLUTION — WHERE EVERYTHING GOES
- **D1** REASON — the firm's **assets are realised**: sold to named buyers at cleared prices, or
  taken over as a going concern (`m-and-a.md`)
- **D2** REASON — the proceeds are **distributed by seniority** (`../instruments/bond.md` N13.a):
  secured lenders, senior, subordinated, equity last
  - D2.a and the **recovery is what the assets actually fetched**, divided as D2 says — never a
    percentage (`cds.md` D2.a)
- **D3** REASON — **losses land on named holders** in the register, in proportion
  (`the-register.md` E3)
- **D4** REASON — its **employees lose their jobs** (`labour.md`), its **suppliers lose their
  receivables** (`trade-credit.md`), and its **capital goes to a buyer**
  (`the-capital-programme.md` D3)
  - D4.a these are the real-economy consequences, and they are what makes a default cost more
    than the credit loss
- **D5** REASON — the party then **ceases to exist**, and every reference to it must resolve to
  the estate or the successor (`the-register.md` F2, `the-audit.md` B6)
- **D6** VERIFY — Σ(recoveries) + Σ(losses) = the firm's assets at realisation, exactly. Money is
  not destroyed by a default; it is transferred and revalued
  - D6.a a residual left on a dead party is a defect (rule 2), and it must be found and paid
    away in every currency the party held (`currency-and-fx.md` B2)

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no firm that cannot die** (C2.a)
- **E2** FORBID — **no death without a destination** for every asset, liability, employee and
  contract (D5)
- **E3** FORBID — **a constant population.** If births exactly offset deaths by construction, A4.a
  and C2 have both been overridden
- **E4** VERIFY — the population, its age distribution and its sector mix are all reads, and they
  should move with conditions

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a new named party with a new identity | `src/engine/simulation/stages/pe-lifecycle.ts:runFirmBirthsForRegion` | ✅ |
| A2 funded by somebody, out of a named account | `src/engine/simulation/stages/pe-lifecycle.ts:fundNewbornDebt` | ✅ |
| A2.a FORBID no endowment from nowhere | `src/engine/simulation/stages/pe-lifecycle.ts:openingCashOf` | ✅ |
| A3 a balance sheet that balances, and very little of it | `src/engine/companyGenerator.ts:generatePrivateCompanies` | ✅ |
| A4 entry happens for a reason | `src/engine/simulation/stages/pe-lifecycle.ts:namedBySegment` | ✅ |
| A4.a entry is a consequence, never a birth rate | `src/engine/simulation/stages/pe-lifecycle.ts:runFirmBirthsForRegion` | ⚠️ |
| A5 it enters a market as a competitor | `src/engine/simulation/stages/pe-lifecycle.ts:regionSalesBySubUnit` | ✅ |
| B1 subject to `firm-fundamentals.md` from week one | `src/engine2/stage08-back.ts:runBackCoreA` | ✅ |
| **B2 a young firm is more fragile** | `src/domain/company.ts:bornWeek` | ❌ |
| B3 distress is observable before default | `src/domain/company-week/credit-standing.ts:creditMetrics` | ✅ |
| B4 a distressed firm acts | `src/domain/company-week/credit-standing.ts:revolverDrawLocal` | ⚠️ |
| C1 a stated, observable definition | `src/domain/company-week/credit-standing.ts:isInDefault` | ⚠️ |
| C2 a consequence of the firm's state | `src/domain/company-week/credit-standing.ts:isInDefault` | ✅ |
| **C2.a FORBID no exogenous default event** | `src/engine/simulation/stages/bank-lending.ts:smePoolAnnualPd` | ⚠️ |
| C3 it triggers things | `src/engine/simulation/stages/estate-resolution.ts:runEstateResolutionStage` | ✅ |
| C4 every default traceable to its cause | `src/engine2/stage08-back.ts:defaultedTickers` | ✅ |
| D1 assets realised, sold to named buyers | `src/engine/simulation/stages/estate-resolution.ts:sellAssetsToPeers` | ⚠️ |
| D2 proceeds distributed by seniority | `src/engine/simulation/stages/estate-resolution.ts:distribute` | ✅ |
| D2.a recovery is what the assets fetched | `src/domain/estate.ts:realisedDebtRecoveryRate` | ✅ |
| D3 losses land on named holders, in proportion | `src/engine/simulation/stages/estate-resolution.ts:reduceHolding` | ✅ |
| D4 employees, suppliers and capital | `src/engine/simulation/stages/trade-settlement.ts:tradeInvoiceWriteOffLocal` | ⚠️ |
| D4.a the real-economy consequences | `src/engine/simulation/stages/labor-market.ts:runLaborReconciliationStage` | ⚠️ |
| D5 the party ceases to exist; references resolve | `src/engine/simulation/stages/estate-resolution.ts:writeOffResidual` | ✅ |
| D6 Σ(recoveries) + Σ(losses) = assets at realisation | `src/domain/estate.ts:estateAssetsLocal` | ⚠️ |
| **D6.a no residual left on a dead party** | `src/engine/simulation/stages/estate-resolution.ts:openEstate` | ⚠️ |
| E1 FORBID no firm that cannot die | `src/domain/company.ts:isActiveCompany` | ✅ |
| E2 FORBID no death without a destination | `src/engine/simulation/stages/estate-resolution.ts:scrapConsignmentsOf` | ⚠️ |
| **E3 FORBID a constant population** | `src/engine/simulation/stages/sme-pools.ts:reinjectedWeight` | ❌ |
| **E4 population, age and mix are reads that move** | — | ❌ |

---

## 3. THE DIFF

### ⚠️ C2.a — THE NAMED TIER IS CLEAN. THE POOLED TIER IS THE WHOLE FORBIDDEN SHAPE

**Searched, and this is the finding: there is no exogenous default event for any named firm.** No
hazard rate is drawn against, no PD is compared to a random number, and `grep`ing `src` for
`random()` beside anything default-shaped returns nothing. Every default in the named tier is
`credit-standing.ts:99` — `cash < 0 && coverage < DEFAULT_COVERAGE_FLOOR`, evaluated *after* the
committed line has been drawn to whatever it will bear. The hazard model that does exist
(`shared-helpers.ts:computeAnnualDefaultProbability`, a structural distance-to-default) is used
**only to price**, and it is deliberately built from the same coverage floor the trigger uses, so
priced risk and realised risk are one model. That is the node satisfied, and it is the strongest
thing in this tree.

**The exception is the SME tier, and it is total.** `bank-lending.ts:243`:

```
lossUSD = (l.principalUSD * smePoolAnnualPd(seg) * (1 - creditRecoveryRate(reg))) / 52
```

A pooled loan's loss is `principal × PD × LGD`, applied every week to every SME loan in the world.
`smePoolAnnualPd` reads `seg.defaultRateAnnualPct`, which `sme-pools.ts:165` sets as
`0.015 + coverageDistress × 0.04 + cashStressIntegral × 0.06` — an affine map from a distress
integral to a RATE, with a 1.5%/yr floor that fires whatever the pool's firms are doing. So for the
whole small-firm half of this economy: nothing defaults, no firm's actions can prevent a loss,
no market's actions can cause one, and the lender's write-down is arithmetic on a rate. That is
C2.a's sentence exactly — "a default assigned by a hazard rate cannot be prevented by a firm's
actions or caused by a market's, which deletes B4 and every credit channel in this atlas".

It matters more than the pool's size suggests, because `sme-pools.md` A5.a is right: this is the
sector where a credit tightening should bite first. Today a tightening reaches the pool (02b's
quoted margins → `blendedMarginBps` → `coverageDistress`) and comes out as a smoothly larger loss
RATE, never as a firm failing.

Not in §3. **Becomes a §3 step**, and it is `sme-pools.md` E1's step too — one step, sized by
whatever resolution the SME tier is given (see that tree's diff).

### ❌ E3 — INSIDE AN SME POOL, BIRTHS EXACTLY OFFSET DEATHS BY CONSTRUCTION

`sme-pools.ts:197-218`. Each stratum sheds `weeklyExitRate × (wᵢdᵢ / Σwⱼdⱼ)` of its weight; the sum
of what leaves is accumulated as `reinjectedWeight` and added straight back to the least-levered
stratum, and the weights are then renormalised to 1. The file states the intent plainly: *"Entry
replaces the exiting weight, so the pool's firm count is conserved while its composition shifts."*

That is the node's forbidden clause word for word. The composition genuinely moves — which is a real
and good mechanism, the cleansing phase of a credit cycle — but the **population cannot**: a pool
defaulting at 5% a year for a decade is exactly as large at the end, with exactly as much employment
and revenue as its measured receipts imply, and there is no channel by which its deaths shrink it.
Entry into the pool is not a decision either; it is the accounting identity of the exit.

The named tier does not have this defect: `runFirmBirthsForRegion` is conditional on a real signal
and `isInDefault` is conditional on a real state, so the named population moves both ways. The pool
is the exception, and it is the tier that holds most of the firms.

Not in §3. **Becomes a §3 step** — the same step as C2.a's, because both are "what resolution is an
SME".

### ❌ B2 / E4 — AGE IS RECORDED AND NOTHING READS IT

`Company.bornWeek` is written at birth (`pe-lifecycle.ts:889`) and read in exactly four places: the
columnar store's field list, a `DEFAULT_TRACE` print, an audit log tag, and a news headline. No
rating, no spread, no lending decision and no funding term is a function of it. B2's three claims —
less cash, no track record, worse credit terms — are all absent, and one of them is **inverted**:
the rating's `revenueVolatility` notch is computed from the revenue ring and returns 0 when the ring
holds fewer than three prints (`stage08-back.ts:1265`), so **a firm with no track record scores the
best possible volatility**. A newborn is also handed a stated `leverage: 2.5` and a coin-flip
`sponsorStyle` (`pe-lifecycle.ts:822`) rather than a capital structure it chose.

E4 is the measurement that would have shown this: nothing anywhere reads the population, its age
distribution or its sector mix over time. It is a **measurement, for §3 step 38**; B2 is a
mechanism gap and **becomes a §3 step**, small.

### ⚠️ D6.a — A DEAD FIRM WITH NO CLAIMS KEEPS ITS MONEY FOR EVER

`estate-resolution.ts:openEstate` returns `undefined` when `claims.length === 0`, and the caller then
scraps the firm's consignments and **returns without opening an estate**. Such a firm is reachable:
a private founder-owned firm whose only debt was a bank facility it has repaid has no institutional
equity rows and no facility rows, so it has no claims at all. It is `isDefaulted`, so it leaves
`isActiveCompany` and every aggregate; stage 08 skips its cash walk; its account balance, its plant
and its input lots stay where they are, owned by a party that no longer trades.

That is rule 2's residual on a dead party, and it is the one D6.a asks to be found and paid away.
It is small in money and exact in kind. The rest of the resolution machinery is genuinely good — the
debtor's own account IS the estate's account, the waterfall pays out of it, `writeOffResidual` sweeps
every row of the dead issuer whether or not it carried a claim, and the ladder is extinguished — so
the fix is to give a claimless death a destination (the residual is the founders', by D2's
seniority) rather than to build anything.

Not in §3. **Becomes a §3 step**, very small.

### ⚠️ D1 — THE ASSET SALE IS A DISPOSAL SCHEDULE, NOT A CLEARED PRICE

`sellAssetsToPeers` sells each week's slice to the region's same-sector active firms **pro rata to
their cash**, at `slice × (1 − hurdle × horizonWeeks / 52)`. Nobody bids. The discount is a stated
present-value haircut rather than what a buyer would pay, the allocation is by balance size rather
than by willingness, and a week with no peer able to pay **scraps** the slice. D1 says "sold to named
buyers at cleared prices"; the buyers are named and the price is not cleared.

This is rule 3's shape and the reason it matters here is D2.a: recovery is only "what the assets
fetched" if what they fetched was struck by somebody. **Becomes a §3 step**, and it is naturally the
same one as `m-and-a.md` B2 (a distressed sale and a takeover are the same auction).

### ⚠️ D4 / D4.a — THE SUPPLIERS' LOSS IS REAL; THE EMPLOYEES' JOBS JUST STOP BEING COUNTED

Suppliers: `trade-settlement.ts:53` writes the invoice off when the buyer is not active, and the
seller takes the loss on its own book — a real, traceable D4, and the best of the three.
Capital: `sellAssetsToPeers` moves it to named peers — real.
Employees: `stage08-back.ts:2316` sets `employeeCount = 0`, and `runLaborReconciliationStage` sums
employment over `isActiveCompany` firms only, so the headcount simply disappears from the region's
matched stock. **There is no separation event**: those workers never enter `separationsByOcc`, are
never matched again through the labour market's own machinery, and no household is notified that its
earner lost a job. The unemployment print moves, the mechanism does not.

**Becomes a §3 step**, small — the layoffs path already exists (`employerWeekPosting` emits
separations); a death has to route its headcount through it.

### ⚠️ C1 / B4 — THE DEFAULT DEFINITION AND THE DISTRESSED FIRM'S OPTIONS

C1 wants a missed payment or a covenant breach. The trigger is a balance-and-ratio state test, and
`DebtTranche` carries no covenants at all — **already §3 step 34**, which names exactly this ("no
covenants, no acceleration, no observable event").

B4's four actions: cutting costs is real (distress layoffs), drawing the line is real
(`revolverDrawUSD`), cutting the dividend is real (`sustainableDividendWeeklyUSD` pays nothing on a
loss). **Selling assets and raising expensive money are absent** — a distressed firm cannot
voluntarily sell plant, and the primary market is a binary gate (`MARKET_ACCESS_DENIED` is `['D']`,
i.e. shut only after it is already too late) rather than a price. Related to **§3 step 35** (there is
no restructuring), which owns the negotiated half; the voluntary asset sale is new and small.

### ⚠️ D6 / E2 — THE CONSERVATION CHECK IS NOT TAKEN PER ESTATE

Nothing asserts `Σ(recoveries) + Σ(losses) = assets at realisation` for a single workout.
`auditOwnership` catches the register consequence (a holder keeping paper of a dead issuer) and
`writeOffResidual` is what closed it, so the outcome is right today; but the identity D6 names is
not measured, and scrappage (unsold inventory perishing, an abandoned plant) is a real value
destruction that any such check must account for explicitly rather than discover. **A measurement,
for §3 step 38.**

### ⚠️ A4.a — ENTRY IS A CONSEQUENCE, ON A QUARTERLY CLOCK AND AT A STATED SIZE

`runFirmBirthsForRegion` ranks pools by `(pool revenue / named-tier revenue) × pool margin` — unserved
demand times the profit of serving it, with no coefficient — and gives an entrant to **every** pool
where that is positive. That is a genuine A4/A4.a: no birth rate, and the signal is the reason.
Two stated shapes remain inside it: the quarterly `nextWeek % 13` gate (the model's structural
clock, consistent with everything else) and `revenueUSD = pool revenue × 0.004`, which fixes every
entrant's opening size at four-tenths of a percent of its pool regardless of what the opportunity is
worth. The size should be what the founders can fund. Small; **becomes a §3 step** or a line of
C2.a's.
