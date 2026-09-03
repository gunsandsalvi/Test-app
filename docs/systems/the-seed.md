# SYSTEM: THE SEED

The state of the world at week zero. Everything after it is a consequence, so a defect here is
indistinguishable from a defect in the mechanism that runs on top of it — except that it is there
from the first audit and never goes away.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT THE SEED MUST BE
- **A1** REASON — a **complete, consistent state**: every party, every account, every holding,
  every instrument, all present at once
- **A2** REASON — it must **pass the audit at week zero** (`the-audit.md` B)
  - A2.a a violation present at week zero is the seed's, and attributing it to a mechanism costs
    weeks of the wrong search
- **A3** REASON — it is a **stock**, and stocks are what the flows then act on
- **A4** FORBID — **no free money and no free assets.** Every deposit is some bank's liability;
  every holding is some issuer's; nothing exists because a constructor needed it to
- **A5** REASON — it is **reproducible from a seed value**, so any run can be re-run

### B. WHO EXISTS
- **B1** REASON — a **population of each type**: households, firms, banks, funds, the state, the
  central bank — enough of each that the type is a distribution, not a single instance
  (`households.md` A2.d)
- **B2** REASON — each has an **identity** that survives the whole run
- **B3** REASON — each is placed in a **region**, and the region determines its money
  (`currency-and-fx.md` B)
- **B4** REASON — each has a **size**, and the sizes are dispersed: a sector of equals never
  produces a market (`the-clearing-engine.md` A1.a)
- **B5** FORBID — **no observed real-world ratio is copied in** (rule 2). A share, a spread, a
  leverage ratio taken from data is an answer written down where a mechanism should be

### C. WHAT THEY HOLD
- **C1** REASON — every party's balance sheet **balances at week zero**, and its equity is the
  read (`the-audit.md` B5)
- **C2** REASON — each asset is **somebody's liability**, party by party, not sector by sector
- **C3** REASON — instruments outstanding at week zero have **terms and a remaining life** — a
  bond seeded at issue is a world with no maturity wall for its whole tenor
  - C3.a and a **maturity profile that is spread**, or every roll arrives in the same week
- **C4** REASON — prices at week zero are **the first clearing's inputs**, not permanent marks
  - C4.a a seeded price that never clears is rule 3's defect, seeded
- **C5** VERIFY — the week-zero balance sheet of each **sector** is a read of its members, never
  a target the members were fitted to

### D. CONSISTENCY WITH FLOWS
- **D1** REASON — the stocks must be **consistent with the flows that will run**: debt with a
  coupon somebody can pay, employment with a wage bill somebody can meet
  - D1.a otherwise week one is a shock the model never recovers from, and everything measured
    afterwards measures the recovery
- **D2** REASON — anything that **accrues** starts from a stated accrual position
- **D3** VERIFY — with all shocks off, week one should be **quiet**: large first-week flows are
  the seed disagreeing with the mechanism, and they are a finding
- **D4** VERIFY — the seed is a **fixed point of nothing**: running the model with no shocks must
  still evolve, because agents have reasons that differ

### E. WHAT THE SEED MUST NOT DECIDE
- **E1** FORBID — **no outcome is seeded.** A seeded default rate, a seeded market share, a
  seeded spread curve is the result assigned in advance (`README.md`, REASON not OUTCOME)
- **E2** REASON — the seed sets **reasons and endowments**; the mechanism produces outcomes
- **E3** VERIFY — changing a seed parameter must change outcomes through a chain that can be
  traced, and if it changes an outcome directly, that outcome was seeded

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a complete, consistent state, all present at once | `src/engine/simulation/initialization.ts:buildSeededGameState` | ⚠️ |
| **A2 it must pass the audit at week zero** | `src/engine/audit/index.ts:auditWeek` | ❌ |
| A2.a a violation at week zero is the seed's | `src/engine/audit/index.ts:lastSnapshot` | ⚠️ |
| A3 it is a stock, and the flows act on it | `src/engine/simulation/initialization.ts:createInitialGameState` | ✅ |
| **A4 FORBID no free money and no free assets** | `src/engine/bootstrap/close-seed.ts:closeSeedMoney` | ✅ |
| A5 reproducible from a seed value | `src/engine/rng.ts:setSimulationSeed` | ✅ |
| B1 a population of each type | `src/engine/bootstrap/firms.ts:generateFirmSeeds` | ✅ |
| B1 (private tier, carriers) | `src/engine/bootstrap/private-firms.ts:generatePrivateFirmSeeds` | ✅ |
| B2 an identity that survives the whole run | `src/engine2/world.ts:rowOf` | ✅ |
| B3 placed in a region; the region determines its money | `src/engine/simulation/initialization.ts:openAccount` | ✅ |
| B4 each has a size, and the sizes are dispersed | `src/domain/stated.ts:SEED_FIRM_CONCENTRATION_DECAY` | ⚠️ |
| **B5 FORBID no observed real-world ratio is copied in** | `src/engine/macro/initialization.ts:HOUSEHOLD_DEBT_RATIOS` | ❌ |
| C1 every party's balance sheet balances at week zero | `src/engine/bootstrap/close-seed.ts:closeSeedMoney` | ✅ |
| C2 each asset is somebody's liability, party by party | `src/engine/ledger/holdings-ledger.ts:seedBook` | ✅ |
| C2 (the issuers' side) | `src/engine/ledger/tranche-ledger.ts:seedLadder` | ✅ |
| **C3 instruments have terms and a REMAINING LIFE** | `src/engine/companyGenerator.ts:debtLadderShape` | ❌ |
| **C3.a a maturity profile that is spread** | `src/engine/macro/initialization.ts:GOV_DEBT_TENOR_WEIGHTS` | ⚠️ |
| C4 prices at week zero are the first clearing's inputs | `src/engine/bootstrap/yield-curves.ts:getRegionYieldCurveParams` | ⚠️ |
| **C4.a a seeded price that never clears is rule 3's defect, seeded** | `src/engine/bootstrap/commodities-and-fx.ts:getInitialFxRate` | ⚠️ |
| C5 VERIFY the sector sheet is a read of its members | `src/engine/simulation/stages/holdings-view.ts:refreshRegionalHoldingsView` | ✅ |
| D1 the stocks are consistent with the flows that will run | `src/engine/simulation/initialization.ts:solveSeedInvestmentFixedPoint` | ⚠️ |
| D1.a otherwise week one is a shock nothing recovers from | `src/engine/simulation/burn-in.ts:probeSteadyState` | ⚠️ |
| D2 anything that accrues starts from a stated accrual position | `src/engine/simulation/initialization.ts:holderAccruedInterestUSD` | ⚠️ |
| **D3 VERIFY with shocks off, week one should be quiet** | `src/engine/simulation/burn-in.ts:compareToSettled` | ❌ |
| D4 VERIFY the seed is a fixed point of nothing | `src/engine/simulation/burn-in.ts:SETTLED_WEEKS` | ⚠️ |
| **E1 FORBID no outcome is seeded** | `src/engine/companyGenerator.ts:RATING_OAS_SPREADS` | ❌ |
| E2 the seed sets reasons and endowments | `src/engine/bootstrap/firms.ts:FirmSeedTemplate` | ⚠️ |
| E3 VERIFY a seed parameter changes outcomes through a chain | `src/engine/rng.ts:DEFAULT_SIMULATION_SEED` | ❌ |

---

## 3. THE DIFF

### ❌ A2 / D3 — THE TWO NODES THAT WOULD CATCH EVERYTHING ELSE ARE BOTH UNASSERTED

**A2 — nothing audits the seed.** `auditWeek(state, w)` is called from inside the harness's week
loop (`scripts/harness.ts:2408`), on the state that comes back from `advanceWeeklyStep`. Before
the loop the harness runs only `m.init?.(state)` (`:2232`), which sets each module's baselines and
checks nothing. So the first state any invariant family ever sees is the world **after** a full
fifty-stage week has run over it. The audit's own header even says it fixed the twin of this
problem — `lastSnapshot` opens as the EMPTY world so week 1's W3/W4/W5 are held to the same
standard as week 2 — which is a statement about the week-over-week DELTA, not about the seed's
own state.

**Consequence, and it is A2.a stated as a fact rather than a warning.** Every violation the audit
reports at week 1 is a violation of the seed OR of the first week's mechanisms, and no run can
tell the two apart. That is precisely the "weeks of the wrong search" the node exists to prevent,
and the project has already paid it: §7.4 is cited 91 times in the plan's own method note, and
every one of those is a defect that turned out to be the seed after it was hunted in a stage.

**D3 — nothing measures week one.** `SHOCKS=0` exists (`harness.ts:36`) and
`compareToSettled(seededProbe, probeSteadyState(state))` exists (`:2723`) — but it runs ONCE, at
the END of the run, comparing the seed against week 60. It is a report, judged by nobody, and it
answers "where did the world settle", not "was week one quiet". The one quantity D3 actually
wants — the size of the first week's flows against a steady week's — is never taken.

**Becomes a §3 step**, and it is the cheapest step in this tree: `auditWeek(state, 0)` before the
loop, plus a probe at week 1 and week 2 through the machinery `burn-in.ts` already has. It is also
the step that should be done FIRST, because every other finding below would then arrive with a
number attached instead of a reading.

### ❌ C3 / C3.a — EVERY CORPORATE BOND IN THE WORLD IS ISSUED IN WEEK ZERO, AND THERE ARE FOUR MATURITY DATES

`companyGenerator.ts:317-321`:

```
if (rank < 2) return { weights: [0.35, 0.35, 0.30], maturityWeeks: [260, 520, 780] }; // 5/10/15y
if (rank < 5) return { weights: [0.60, 0.40], maturityWeeks: [260, 520] };            // 5/10y
return { weights: [1.0], maturityWeeks: [364] };                                      // 7y
```

…and every tranche it builds carries `originationWeek: 0` (`:354`, `:364`). So the entire
corporate universe — ~200 named issuers a region plus the private tier — is issued at par on the
same day, at the same rating-table spread, and comes due on **week 260, 364, 520 or 780**. This is
C3's stated failure verbatim: *"a bond seeded at issue is a world with no maturity wall for its
whole tenor"*, and C3.a's *"or every roll arrives in the same week"*, both at once.

**Consequence.** For the whole 60-week reference run — and for the 260-week run — no corporate
bond matures, nothing is refinanced, no issuer faces a wall, and the primary market is fed only by
new capex needs. The rollover channel, which is the main way credit conditions reach a real firm,
is switched off for the entire measurable life of the model. It also means every issuer's ladder
ages in lockstep, so duration, coverage and the whole term structure of corporate credit move
together for reasons that are an artifact of the seed.

**The sovereign side got this right and is the template**: `macro/initialization.ts:396-397` seeds
each bucket mid-life (`originationWeek: -tenorWeeks/2`, `maturityWeek: +tenorWeeks/2`). It is still
`⚠️` for C3.a — seven buckets means the 5-year bucket's whole 24.6% comes due in one week
(`GOV_DEBT_TENOR_WEIGHTS:313`) — but the shape is right and the corporate generator can copy it.

**Becomes a §3 step.** Small to write (a draw over remaining life, per tranche), large in effect:
it is a world relabel, every credit number moves, and it will make things look worse before better
(rule 11).

### ❌ E1 / ⚠️ C4 / C4.a — THE SPREAD CURVE, THE YIELD CURVE AND THE FX RATE ARE ALL SEEDED ANSWERS

E1 forbids a seeded spread curve by name, and there is one:
`companyGenerator.ts:521` sets `oasSpreadBps = RATING_OAS_SPREADS[tmpl.initialRating].baseBps`,
and `:522` sets the CDS spread to that plus a ±5bp jitter. The rating→spread map is the answer the
corporate credit auction is supposed to produce, written down before it runs. The seeded ladder's
coupons (`:352`) and the loan margins (`:363`) are derived from the same table, so the CASH FLOWS
of every instrument in the model are set by it too — which is why it survives the first clearing
that overwrites the print.

Beside it: `getRegionYieldCurveParams` seeds four Nelson-Siegel parameter sets per region, and
`getInitialFxRate` seeds every pair. Both are `⚠️` rather than `❌` for C4 because both ARE
overwritten by a real clearing in week one (07c refits the curve, fx-clearing prints the rate) —
they are genuinely first inputs. The OAS table is not: it is re-read every time a new firm is born
(`companyGenerator.ts:326`) and it is the sovereign-independent term in every seeded coupon.

**Already §3 step 13 and step 21** in part — 13 makes the spread a derived measure of a cleared
price, and until it lands the seeded table has nowhere else to go. The specific finding that is
NEW is the coupon: a cleared spread in week one does not touch `couponRate`, so the seed's rating
table is the permanent cash flow of every bond the world opened with. **Becomes a §3 step**, and
it pairs naturally with the C3 fix above (both are one pass over `generateDebtTranches`).

### ❌ B5 — THE OBSERVED RATIOS ARE THERE, AND ONE OF THEM SAYS SO

`macro/initialization.ts:318-322` carries its own admission:

```
// RULE 4: observed household balance-sheet ratios. …
const HOUSEHOLD_DEBT_RATIOS = { creditCardToIncome: 0.075, otherConsumerLoanToIncome: 0.133,
                                mortgageToIncome: 0.90, depositsToIncome: 0.65,
                                equityHoldingsToIncome: 1.8 };
```

`bootstrap/national-accounts.ts` adds `EMPLOYER_PAYROLL_TAX_RATE = 0.0765` (the US FICA rate to
four figures), `CONSUMPTION_TAX_RATE = 0.10`, `HOUSEHOLD_EFFECTIVE_TAX_RATE = 0.1322`,
`GOV_PROCUREMENT_SHARE_OF_SPENDING = 0.35`, `UNEMPLOYMENT_REPLACEMENT_RATE = 0.35` and
`HOUSEHOLD_CAPITAL_INCOME_SHARE_OF_OUTPUT = 0.13`. The tax rates are defensible as POLICY (a rate
somebody chose); the capital-income share and the household ratios are not — they are outcomes of
payout and saving decisions, observed and written down.

**The mechanism to fix this exists and is barely used.** `domain/stated.ts` is the registry —
declare a number with its kind, its owner and the measurement that will replace it — and it holds
**11 declarations**, 6 of them SHAPE, while `check-hygiene.sh:137` puts the engine's undeclared
fractional literals at a budget of **1377**. So B5 is `❌` on substance and the instrument that
would make it `⚠️` is two orders of magnitude behind the code.

**Already §3 rule 2 / step 26's territory** for the literals generally; the SEED's share of them
is not separately named. Recorded here as the number: 1377 against 11.

### ⚠️ A1 / D1 — THE GOODS SIDE OF THE STOCK IS NOT SEEDED AT ALL

A1 requires every stock present at once. `audit/index.ts:20-28` states the exception plainly: the
GOODS are claimed against an EMPTY world *"because the world genuinely starts with none — no firm
is generated holding finished stock and no input lot is seeded"*. §9's 11e (part 2) records the
same and is `PENDING`. So firms open with production leads to fill, no finished inventory and no
input lots, which is a D1.a shock by construction — `probeSteadyState`'s first line
(`burn-in.ts:69`, `wip weeks of throughput`) exists precisely to measure it, and §6.1 measured
lines holding 1.06 weeks of a 6-week lead.

The in-transit pipeline IS seeded full (`initialization.ts:1690`, with the reason stated), which
is the correct treatment and shows the shape the goods stocks need.

**Already §9 11e (part 2), PENDING.** Not a new step; recorded because it is the largest single
hole in A1 and a reader of this tree should not have to find it in the log.

### ⚠️ D2 — THE ACCRUAL LEDGERS OPEN EMPTY, INCLUDING FOR PAPER SEEDED MID-LIFE

`initialization.ts:1652-1653` opens `holderAccruedInterestUSD` and `sovereignAccruedInterestUSD` as
empty maps, deliberately (§7.274 made them REQUIRED so no load path could reset them). But the
sovereign buckets are seeded half-way through their life (`macro/initialization.ts:396`), so their
true accrued position at week zero is roughly half a coupon and the model says zero. The first
coupon then pays only what accrued from week 1.

It is self-consistent — the issuer's expense accrues on the same schedule, so nothing leaks — and
that is why it is `⚠️` and not `❌`. What it costs is the level: every holder's first coupon is
short by up to half a period, and the treasury's first-year interest outlay is understated by the
same amount. D2 asks for a *stated* accrual position; zero is stated, and it is the wrong one for
mid-life paper.

**Becomes a §3 step**, tiny: seed the accrual from `(week − originationWeek) mod couponPeriod`
where the seed already knows both.

### ⚠️ B4 / E2 / D4 — MEASUREMENTS AND SHAPES THAT ARE PRESENT BUT THIN

**B4** (sizes dispersed): real dispersion exists, but the curve is
`SEED_FIRM_CONCENTRATION_DECAY = 0.80` applied as `decay^rank` — a geometric rank curve declared
as a SHAPE with its own scheduled death ("the shares the firms win"). Present, stated, honest.

**E2** (the seed sets reasons and endowments): `FirmSeedTemplate` carries revenue bases, sector,
rating and size — endowments, correctly — but `initialRating` is a reason and an outcome at once,
since the rating is what the assessment mechanism should produce from the fundamentals the same
template sets. See `ratings-and-assessment.md`.

**D4 / E3** (the seed is a fixed point of nothing; a seed parameter changes outcomes traceably):
both are VERIFY nodes nobody reads. `burn-in.ts` has the whole instrument — `SETTLED_WEEKS`,
`TOLERANCES`, `movedQuantities` — and it is `SEED_BURN_IN`-gated and off by default
(`burn-in.ts:170`), so no run in the project's normal loop takes either measurement. E3's
`SEED=<n>` switch exists and nothing compares two seeds' outcomes.

**A measurement, for §3 step 38.**
