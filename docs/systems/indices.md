# SYSTEM: INDICES

A number computed from prices that already exist. An index is not a market and has no independent
value: it is a read (rule 4). It matters because things are priced, benchmarked, mandated and
settled against it, so a wrong index is wrong in every one of those places at once.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT AN INDEX IS
- **A1** REASON — a **stated rule** over a **stated set of constituents** at **stated weights**
  - A1.a all three are public and stable; an index nobody can reproduce is not a benchmark
- **A2** REASON — it reads **cleared prices** (`the-clearing-engine.md` D1) and nothing else
- **A3** FORBID — **an index is never an input to its own constituents.** If a constituent's price
  is derived from the index, the index measures itself and the circularity is invisible in every
  output
- **A4** REASON — it has a **unit and a base**: a level is meaningless without them (rule 8)

### B. CONSTRUCTION
- **B1** REASON — **weights come from something real**: market capitalisation, amount outstanding,
  equal weight — and the choice is stated
- **B2** REASON — the constituent set **changes**: firms enter and leave, bonds mature
  (`firm-birth-and-death.md`, `the-register.md` B4)
  - B2.a and a change must not create a jump in the level: the index is **chained** across the
    rebalance, because the level's continuity is the whole basis of a return series
- **B3** REASON — **corporate actions** are handled explicitly — a split changes shares and price
  together and must not change the level (`the-register.md` E4)
- **B4** VERIFY — the index return over a period equals the weighted return of its constituents
  over that period, to float dust (rule 7)

### C. WHAT IT IS USED FOR
- **C1** REASON — a **benchmark**: a manager's performance is measured against it, and that
  measurement drives flows (`fund-shares.md` C1)
- **C2** REASON — a **mandate**: a fund tracks it, so a change in the index is a **real forced
  trade** by every tracker, at the same time
  - C2.a VERIFY — inclusion and exclusion should therefore be visible in the constituent's price,
    as a consequence of C2, never as an applied bump
- **C3** REASON — an **underlying**: futures, options and swaps settle against it
  (`the-derivative-layer.md`), which makes it a settlement price and therefore money
- **C4** REASON — a **signal**: participants read it as the state of a market

### D. INDEX FAMILIES THIS WORLD NEEDS
- **D1** REASON — an **equity index** per region (`equity.md`)
- **D2** REASON — a **credit index**: an average spread or price over a defined bond set
  (`corporate-credit.md`), which is a derived read of derived reads and must be built from prices
  first (rule 3)
- **D3** REASON — a **rate benchmark**: the reference short rate that floating instruments fix on
  (`money-market.md`)
  - D3.a it must be a read of **actual transactions**, because everything that references it pays
    real money against it
  - D3.b FORBID — **no benchmark that is posted rather than transacted.** A rate nobody traded at
    is an assigned price with a huge notional attached to it
- **D4** REASON — a **price level** for the real economy — and CPI and PPI are **different
  indices** (user, 2026-09-03): different baskets, different stage of production, different
  weights, and they can move apart
  - D4.a the difference between them **is a margin story**: input prices rising faster than output
    prices is a squeeze on firms (`firm-fundamentals.md`), and collapsing the two hides it

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no index without constituents.** A level that moves without a constituent
  moving is an invented price
- **E2** FORBID — **no stored level.** It is recomputed from the register and the prices, always
- **E3** VERIFY — an index and its constituents move together by construction, and a divergence is
  a defect in the read, not a market event

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a stated rule over stated constituents at stated weights | `src/domain/indexes.ts:IndexConstituent` | ⚠️ |
| A1.a all three public and reproducible | `src/ui/objects/index-object.tsx:indexesOf` | ⚠️ |
| A2 reads cleared prices and nothing else | `src/engine/simulation/stages/index-calculation.ts:indexValueLocal` | ⚠️ |
| **A3 FORBID never an input to its own constituents** | `src/engine/macro/indices.ts:measureBeta` | ⚠️ |
| A4 a unit and a base | `src/domain/indexes.ts:INDEX_BASE_LEVEL` | ✅ |
| B1 weights come from something real | `src/engine/simulation/stages/index-calculation.ts:rebalance` | ✅ |
| B2 the constituent set changes | `src/domain/indexes.ts:INDEX_REBALANCE_WEEKS` | ✅ |
| B2.a chained across the rebalance | `src/engine/simulation/stages/index-calculation.ts:basketValueLocal` | ✅ |
| B3 corporate actions handled explicitly | — | ❌ |
| B4 VERIFY index return = weighted constituent return | — | ❌ |
| C1 a benchmark, and the measurement drives flows | — | ❌ |
| C2 a mandate: a real forced trade by every tracker | `src/engine/simulation/stages/etf-demand.ts:indexFundDemand` | ✅ |
| C2.a VERIFY inclusion visible in the constituent's price | — | ❌ |
| C3 an underlying futures/options/swaps settle against | `src/domain/derivatives/registry.ts:DERIVATIVE_CLASSES` | ❌ |
| C4 a signal participants read | `src/engine/macro/indices.ts:regionIndexOf` | ✅ |
| D1 an equity index per region | `src/domain/indexes.ts:INDEX_DEFINITIONS` | ⚠️ |
| D2 a credit index over a defined bond set | `src/engine/simulation/stages/index-calculation.ts:creditMarketValueLocal` | ✅ |
| **D3 a rate benchmark floating instruments fix on** | `src/domain/company.ts:referenceBenchmark` | ❌ |
| D3.a a read of actual transactions | `src/domain/pricing/tranche.ts:policyRate` | ❌ |
| **D3.b FORBID no benchmark that is posted rather than transacted** | `src/engine/macro/evolution.ts:taylorTarget` | ❌ |
| D4 a price level — CPI and PPI as DIFFERENT indices | `src/engine/simulation/stages/price-index.ts:computeCpiLevel` | ⚠️ |
| D4.a the difference between them is a margin story | — | ❌ |
| **E1 FORBID no index without constituents** | `src/engine/macro/indices.ts:makeIndexMetric` | ❌ |
| **E2 FORBID no stored level** | `src/engine/macro/indices.ts:prevIndices` | ❌ |
| E3 VERIFY index and constituents move together | — | ❌ |

---

## 3. THE DIFF

### ❌ D1 / E1 / E2 — THERE ARE TWO INDEX SYSTEMS, AND THE ONE EVERYTHING READS IS THE INVENTED ONE

`indexes.ts` + `index-calculation.ts` is the rule-based system this tree describes: a membership
rule, a quarterly rebalance, market-value weights, and a level chained off the basket so a
rebalance cannot print a return (`index-calculation:150-171`). It is correct, and **its level has
no reader.** `grep` finds `MarketIndex.level` written at `index-calculation:145,161,175` and read
nowhere in `src/` — `etf-flows` and `etf-demand` take `totalValueUSD` and `constituents`, and
`ui/objects/index-object.tsx` renders names and weights only. The index publishes no level.

The level everything DOES read is `macro/indices.ts:calculateCompositeIndices`, a second, older
system with different regions, a different base (`regionIndexBase`, ~1000 scaled by population ×
productivity, against `INDEX_BASE_LEVEL = 100`), no published membership, no rebalance calendar,
and a **stored level moved by a delta**: `newUS = prevUS * (1 + usChange)` at `indices.ts:107`,
where `usChange` is this week's cap-weighted return. Nothing ever re-reads a basket value, so
E2 fails in the strong form the node means — the level is not recomputed from the register and the
prices, it is accumulated, and a membership change enters it as whatever `prevPriceOf` happens to
return.

**And its first year is fabricated.** `makeIndexMetric` at `indices.ts:180` does
`hist = prev ? [...prev.historical.slice(-51), val] : generate52WeekHistory(val, 0.015)`, and
`macro/utils.ts:2-12` is a random walk: `val * (1 + (random() − 0.5) * volatility)`, 51 steps
backwards from the seed level. So at inception every one of the twenty `IndexMetric` series —
four regional composites, eight OAS series, four sector indices, the commodity composite, the
global 10Y — carries a year of price history that no constituent ever produced. That is E1
exactly: a level that moved without a constituent moving.

It is not decoration. `stage08-back.ts:2016` measures every company's beta as
`measureBeta(ownPrices, regionIndexOf(state.compositeIndices, region).historical, prior)`, and
`measureBeta` needs 12 points and takes up to 53. **For the model's first year, every beta in the
world is a covariance against a random walk** — and beta is the discount rate in
`07e-equity-clearing:411 fairValuePerShare`, in `bank-lending:91`, `labor-market:258` and
`freight-clearing:123`. This is the same defect as the fabricated CPI year that §9 records as
fixed *("(d) **The fabricated CPI year is gone** — 53 weeks compounding at…")*; the composite
indices still have it. Also `prevTech ?? 1000` at `indices.ts:102-105` seeds four sector indices at
a bare literal, and `getDebtWeightedOas` returns `IG_OAS_FALLBACK`/`HY_OAS_FALLBACK` — a rating
table's spread — for any bucket with no companies in it, which is a credit index level with no
credit in it.

Not in §3. **Becomes a step**, and a large one: it is a delete, not a build — the rule-based system
already exists and is better, so the work is to publish its level, point `measureBeta`, the UI's
macro page and stage 12's marks at it, and remove `calculateCompositeIndices` and
`generate52WeekHistory` with it.

### ⚠️ A1 — A CREDIT INDEX'S CONSTITUENTS ARE ISSUERS, IN A FIELD CALLED `instrumentId`

`IndexConstituent.instrumentId` is one field for all six index families, and it does not hold the
same kind of thing in all six. `index-calculation.ts:rebalance` maps over COMPANIES and mints every
constituent the same way whatever the definition's asset class, so:

- an EQUITY index's constituent names the company's equity — and since a listed equity is keyed by
  its issuer's own id, that string happens to be right;
- an IG, HY or LEV_LOAN index's constituent names the **ISSUER**, valued at that issuer's whole
  credit book (`indexValueLocal` → `creditMarketValueLocal(v2, comp, …)`), and both credit
  adapters read it back as one: `07b:571` `bondsByIssuerId.get(c.instrumentId)`, `07d:489`
  `loansByIssuerId.get(c.instrumentId)`.

So a credit index has no constituent instruments at all. It has issuers, weighted by the market
value of everything they owe, and the tracker's demand is spread across that issuer's tranches
afterwards. A1 wants a *stated set of constituents*; what is stated is a set of borrowers, and the
field's name says otherwise.

**This is the one place §3.13-BOOK slice (a) made a conflation quieter rather than louder.**
Branding `IndexConstituent.instrumentId` as `InstrumentId` should have failed here. It did not,
because slice (a)'s own `equityInstrumentId(c.id)` launders a company id into the instrument space
— correct for equity, and for credit it hands the borrower's id to a field that now claims to be an
instrument. The type is satisfied and the model is not.

**Consequence.** It is invisible today because both credit adapters expect issuers, so the two
sides agree. It becomes wrong the moment anything joins an index to the register or the price
table by that field — which is exactly what slice (d)'s instrument index invites, and what B4
(❌, *index return = weighted constituent return*) would need in order to be measurable at all.

**And the EQUITY side reads it back as an issuer too (§3.13-BOOK c-then-2).** Branding the entity
index's key made `basketValueLocal` fail to compile: it looks each constituent up in a map keyed by
COMPANY id, which is a third reader treating this field as an issuer — so *every* consumer of
`IndexConstituent.instrumentId`, equity and credit alike, wants a borrower. The crossing is now the
named `equityIssuerId`, which makes it countable rather than fixing it. Three read sites for slice
(d) to resolve: `index-calculation.ts:basketValueLocal`, `07b:571`, `07d:489`.

**Becomes a §3 step**, in slice (d)'s neighbourhood: either the field splits by asset class, or a
credit index states tranches and `rebalance` stops being one function over companies. Not slice
(a)'s to decide — recorded here so the decision is made rather than inherited.

### ❌ D3 / D3.a / D3.b — THE BENCHMARK IS A POSTED POLICY RATE, AND A CLEARED ONE EXISTS BESIDE IT

Every floating instrument in the model fixes on `region.policyRate`. Measured: `front-core:524`
(`isFloating ? principalUSD * (policyRate + annualRate)`), `pricing/tranche.ts:33`,
`07f-short-debt-clearing:665`, `derivative-markets/irs.ts:114`, `bank-lending:232,267,492,493`,
`02b-bank-diversification:224,229,239,255`, `stage08-back:1186,1394,1518,1668`,
`prime-brokerage:142,260`, `overdraft-sweep:90,99`, `sme-pools:115`, `pe-lifecycle:533`. And
`policyRate` is set by `evolution.ts:846-861`: an inertial Taylor rule moving 15% of the way to
`rStar + expectedInflation + 0.5·inflation_gap + 0.5·output_gap`, rounded to 25bp, at a meeting
every thirteenth week. **Nobody transacts at it.** That is D3.b's forbidden shape with the whole
floating-rate book referencing it.

`Company.referenceBenchmark` (`company.ts:228`) is `'SOFR' | 'EURIBOR' | 'SONIA' | 'TONA'`,
assigned at `companyGenerator:554` and `07d-leveraged-loan-clearing:144` — a **label with no
value behind it.** Nothing reads it to price anything; it is printed and forgotten. (Rule 4 also
says those four names should not be in the tree at all.)

The sharp part: **the model already clears an overnight rate.** `repo-clearing.ts:357` returns
`onRateAnnual` from a real session, written to `reg.repoRateAnnual` at
`02b-bank-diversification:414`, and its own comment there says *"RATE is one market print per
region"*. It is read by the money-market fund's yield, the IRS float leg's discount
(`irs.ts:231`) and `derivative-lifecycle:114` — and by nothing that fixes a coupon. So the world
has a transacted overnight rate and a posted policy rate, and the entire floating book references
the posted one. **Becomes a §3 step**, and it is small: the fixing source is one expression
repeated at ~25 sites.

### ⚠️ D4 / D4.a — THERE IS NO PPI, AND THE INPUT PRICE THAT WOULD BUILD IT IS ALREADY CLEARED

`price-index.ts` builds a genuine Laspeyres CPI from stage 05's cleared shelf prices, weighted by
real household spend, rebased and chain-linked (`buildCpiBasket`, `computeCpiLevel`), plus a core
measure over the same basket with food and energy dropped. That is one index and one exclusion,
not two indices. `grep -i ppi` over `src/` returns nothing.

The missing half is not missing data. `shelfPriceFor` at `price-index.ts:52` distinguishes exactly
the two prices a PPI/CPI pair needs — `demand.shelfUnitPriceUSD` (what a household pays) and
`demand.unitPriceUSD`, the **landed** price, which its own comment calls *"the price a business
pays for the same good"*. A producer price index is that second series over a producer basket
(`buyerMix` already carries the firm share the way it carries `HOUSEHOLD`). Without it D4.a has no
expression: the margin squeeze — input prices rising faster than output prices — is the difference
between two series, and only one series exists. Not in §3. **Becomes a step**, small: the basket
builder is already parameterised by buyer mix.

### ⚠️ A3 — BETA IS MEASURED AGAINST THE INDEX AND THEN PRICES THE INDEX'S OWN CONSTITUENTS

`measureBeta(stockPrices, indexHistory, prior)` → `comp.beta` (`stage08-back:2386`) →
`betaArr[ci]` → `fairValuePerShare({ …, beta })` at `07e-equity-clearing:411`, which is the
holder's reservation price in the equity book. The index history is the cap-weighted move of those
same holders' constituents. The loop is real: constituent price → index → beta → discount rate →
constituent reservation price → cleared constituent price.

Marked `⚠️` and not `❌` deliberately. It is a one-week-lagged covariance, not a level feedback,
and it is what CAPM actually does, which rule 1 favours. What makes it a finding rather than
fidelity is the first paragraph of this diff: for the first fifty-two weeks the covariance is
struck against `generate52WeekHistory`'s random walk, so A3's circularity is not even closed on a
real index — it is closed on an invented one. **It closes when D1/E1 does**, and needs no step of
its own.

### ✅ A2 / D2 — THE CREDIT INDEX READS CLEARED PRICES NOW

**CLOSED, §9.13-CREDIT rows 1 and 3.** It used to price each fixed tranche at
`calculateNelsonSiegelZeroRate(years, curve) + comp.oasSpreadBps / 10000` — a third opinion about a
price the auction had already struck, on the **fitted** curve rather than the cleared one — while
the loan leg read `leveragedLoan.pricePar`, itself linearised out of a cleared margin. Both credit
books deposit a price per tranche now and `creditMarketValueLocal` is one read of it for either
kind; a tranche no session has printed contributes nothing rather than a guess, which is what an
index of what traded means.

`12-portfolio` was the other half named beside this one and it reads the cleared price too. What is
left of step 25's fit-versus-cleared split is `11-fiscal` and `call-protection`.

### ❌ C1 / C3 — AN INDEX IS A MANDATE HERE AND NOTHING ELSE

C2 is real and well built: `etf-demand.ts:indexFundDemand` puts a price-insensitive buyer at index
weights into every clearing book, and `etf-flows.ts` sizes it off the entity's own mandate. But
the other two uses of an index do not exist.

**C1** — nobody's performance is measured against a benchmark, and no flow follows from it.
`indexedShare` (`etf-flows:63`) is a *research-coverage* rule (how many names an AUM can cover),
not a benchmark comparison; there is no tracking error, no relative return, and no manager who
loses money for underperforming.

**C3** — `DERIVATIVE_CLASSES` has four members (IRS, CDS, COMMODITY_FUTURE, FX_FORWARD). No
contract references an index, so no index is a settlement price. Partly **already §3 step 17d**
(the credit index/CDX) and adjacent to **17e** (bond futures); an equity index future is named
nowhere and would be the third.

### ❌ B3 / B4 / C2.a / E3 — ONE MISSING MECHANISM AND THREE UNMEASURED VERIFIES

**B3** is a genuine absence: `grep -i "split"` over `src/` finds no share split or reverse split
anywhere, so no corporate action can test whether the index survives one. Small, and arguably
**OUT OF SCOPE** until a firm has a reason to split — but it is MISSING rather than declined, and
the tree should not record it as a decision nobody made.

**B4**, **C2.a** and **E3** are measurements nobody takes. The only index read in the audit is
`ownership.ts:301`, which checks that constituent weights sum to 1 — not that the level's return
equals the weighted constituent return, not that an inclusion moved a price, not that index and
constituents move together. All three are **measurements, for §3 step 38.**
