# SYSTEM: LABOUR

The market where households sell time and firms buy it. It is the largest flow in the economy in
both directions — wages are most of household income (`households.md` B1) and most of firm cost
(`firm-fundamentals.md` B3) — and it is the only market where the same quantity is somebody's
income and somebody's cost at the same instant.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT IS TRADED
- **A1** REASON — **hours of a person's time**, supplied by a named household to a named firm
- **A2** REASON — the price is the **wage**, per unit of time, in a currency (rule 8)
- **A3** REASON — labour is **heterogeneous**: skill, sector, region — and a job in one is not a
  job in another
  - A3.a which is why unemployment and vacancies can be high **at the same time**, and a single
    homogeneous labour market cannot produce that
- **A4** REASON — the relationship **persists**: employment is a state, not a per-period trade,
  which is what makes hiring and firing decisions rather than continuous adjustment

### B. THE SUPPLY SIDE
- **B1** REASON — a household **decides** whether to work and how much, given the wage and its
  alternatives (`households.md` A2.c)
- **B2** REASON — the **workforce is finite**: a stock of people, which caps total employment
- **B3** REASON — a person is in exactly one state: **employed, unemployed, or out of the
  workforce**, and moving between them is an event
- **B4** REASON — an unemployed person **searches**, and search takes time — which is why
  unemployment is never zero even when every vacancy could be filled
- **B5** VERIFY — employed + unemployed + inactive = the population, exactly, every week

### C. THE DEMAND SIDE
- **C1** REASON — a firm **hires when the worker adds more than the wage costs**
  (`firm-fundamentals.md` E2)
  - C1.a which depends on its **output price** (`goods.md`) and its **capital**
    (`the-capital-programme.md` A2)
- **C2** REASON — hiring has a **cost and a lag**: finding, and the time before the person is
  productive
- **C3** REASON — firing has a **cost** too, which is why firms hold labour through a soft patch
  and shed it when they are sure — and that asymmetry is where the cycle in employment comes from
- **C4** REASON — a firm that **fails** releases its workers at once
  (`firm-birth-and-death.md` D4)
- **C5** REASON — a **vacancy** is a real posted intention to hire, and it can go unfilled

### D. THE CLEARING
- **D1** REASON — the wage is a **price that clears** (`the-clearing-engine.md`) between posted
  supply and posted demand, per skill and region
- **D2** REASON — it does **not clear instantly**: wages are sticky because the relationship in A4
  is contractual and renegotiating is costly
  - D2.a so the adjustment falls on **quantity** — employment — which is the central fact about
    this market and the reason recessions have unemployment in them
  - D2.b VERIFY — stickiness must be a **consequence of the contract and the renegotiation cost**,
    never a coefficient damping a wage series
- **D3** REASON — the **matching is imperfect**: not every unemployed person meets every vacancy
  (A3.a, B4)
- **D4** VERIFY — unemployment and vacancies should move against each other over the cycle, as a
  consequence of B4, C5 and D3

### E. WHAT IT FEEDS
- **E1** REASON — wages are **household income** (`households.md` B1), which drives consumption
- **E2** REASON — wages are **firm cost**, which drives margin and price (`goods.md`,
  `indices.md` D4)
  - E2.a so a wage rise is simultaneously more demand and more cost, and which dominates is a
    result, not an assumption
- **E3** REASON — wage income is **taxed** (`the-treasury.md` C1)
- **E4** REASON — job loss changes a household's **ability to service debt**
  (`households.md` E4), which is where labour reaches the credit system

### F. WHAT MUST NOT HAPPEN
- **F1** FORBID — **no employment without an employer.** Every job is at a named firm, and the
  wage leaves that firm's account
- **F2** FORBID — **no wage bill without headcount**, and no headcount above the workforce (B2)
- **F3** FORBID — **no exogenous unemployment rate.** It is a read of B3, and a written path
  deletes C1, C3 and D3 at once

---

## 2. THE MAPPING

Mapped 2026-09-03; re-marked 2026-09-05 (§9.24-i). `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 hours of a named person's time to a named firm | `src/engine/simulation/stages/labor-market.ts:employedByOccBefore` | ⚠️ |
| A2 the price is the wage, per unit of time, in a currency | `src/engine/bootstrap/labor-and-wages.ts:getBaseAnnualWageLocal` | ✅ |
| A3 labour is heterogeneous: skill, sector, region | `src/domain/region-macro.ts:OCCUPATION_TYPES` | ⚠️ |
| A3.a so unemployment and vacancies can be high at once | `src/domain/labour-clearing.ts:clearLabourMatches` · `src/engine/simulation/stages/labor-market.ts:occupationalMobility` | ✅ |
| A4 the relationship persists — employment is a state | `src/domain/company.ts:employeeCount` | ⚠️ |
| **B1 a household decides whether to work, given the wage** | `src/engine/macro/evolution.ts:participationDrift` | ❌ |
| B2 the workforce is finite | `src/domain/region-macro.ts:laborForceCount` | ✅ |
| B3 exactly one state: employed, unemployed, inactive | `src/engine/simulation/stages/labor-market.ts:seekers` | ⚠️ |
| B4 an unemployed person searches, and search takes time | `src/domain/region-macro.ts:MATCHING_EFFICIENCY` | ✅ |
| B5 VERIFY employed + unemployed + inactive = population | `src/engine/simulation/stages/labor-market.ts:reconcileEmploymentView` | ⚠️ |
| C1 a firm hires when the worker adds more than the wage | `src/domain/company-week/labor-demand.ts:employerWeekPosting` | ⚠️ |
| C1.a which depends on its output price and its capital | `src/engine/simulation/stages/labor-market.ts:outputPriceVsBaselineOf` | ✅ |
| C2 hiring has a cost and a lag | `src/domain/region-macro.ts:HIRING_ADJUSTMENT_SPEED_MULTIPLE` | ⚠️ |
| **C3 firing has a cost, and the asymmetry is the cycle** | `src/domain/region-macro.ts:LAYOFF_SPEED_MULTIPLE` | ⚠️ |
| C4 a failed firm releases its workers at once | `src/engine/simulation/stages/labor-market.ts:runLaborReconciliationStage` | ✅ |
| C5 a vacancy is a real posted intention, and can go unfilled | `src/engine/simulation/stages/labor-market.ts:carriedVacanciesByOcc` | ✅ |
| D1 the wage is a price that CLEARS | `src/domain/labour-clearing.ts:clearLabourMatches` | ⚠️ |
| D2 it does not clear instantly — wages are sticky | `src/engine/simulation/stages/labor-market.ts:avgPaid` | ⚠️ |
| D2.a so the adjustment falls on quantity | `src/engine/simulation/stages/labor-market.ts:hiresByOcc` | ✅ |
| D2.b VERIFY stickiness is the contract's, not a coefficient | `src/engine/simulation/stages/labor-market.ts:avgPaid` | ⚠️ |
| D3 the matching is imperfect | `src/domain/region-macro.ts:MATCHING_ELASTICITY` | ✅ |
| D4 VERIFY unemployment and vacancies move against each other | `src/engine/simulation/stages/labor-market.ts:vacancyRate` | ⚠️ |
| E1 wages are household income | `src/engine/macro/household-cohorts.ts:wageIncomeLocal` | ✅ |
| E2 wages are firm cost | `src/engine2/front-core.ts:weeklyPayrollLocal` | ✅ |
| E2.a a wage rise is both demand and cost | `src/engine/simulation/stages/05-unit-bidding.ts:currentPayrollWeeklyLocal` | ✅ |
| E3 wage income is taxed | `src/engine/bootstrap/national-accounts.ts:splitWageBill` | ✅ |
| E4 job loss changes the ability to service debt | `src/engine/macro/evolution.ts:householdStressSignal` | ⚠️ |
| F1 FORBID no employment without an employer | `src/engine/simulation/stages/labor-market.ts:employers` | ✅ |
| F2 FORBID no wage bill without headcount | `src/engine/bootstrap/labor-and-wages.ts:weeklyWageBillLocal` | ✅ |
| **F3 FORBID no exogenous unemployment rate** | `src/engine/simulation/stages/labor-market.ts:unemploymentRate` | ✅ |

---

## 3. THE DIFF

### ⚠️ D1 / D2 / D2.b — THE MATCHES CLEAR ON THE BID; THE SUPPLY SIDE HAS NO RESERVATION YET, AND THE STICKINESS HAS NO CONTRACT

*2026-09-05 (§9.24-i). The fill ratio is gone. Every posting is a bid — the employer's openings in
an occupation at its own `offeredWageIndex` — and the week's matches go to the highest bids first,
pro rata within an equal bid (`domain/labour-clearing.ts:clearLabourMatches`); the movers of the
mobility pass take what the first pass left, in the same order. The bid that took the last match
is the occupation's print (`OccupationPool.clearedWageIndex`). A firm the market rationed bids that
price, or its own rent-sharing level if higher, and closes the gap at its management's horizon —
`WAGE_PUSH_PER_UNFILLED_SHARE_ANNUAL`, `WAGE_PULL_PER_MARGIN_SHORTFALL_ANNUAL` and the tightness
ease are deleted. The going rate is the employment-weighted average of what is actually paid —
firms at their own levels, the segments and the government at the rate — a read, not a walk;
`MARKET_WAGE_CATCHUP_SPEED_WEEKLY` is deleted with it.*

What is still ⚠️:

- **D1** — the demand side clears on price; the supply side does not yet post one. A seeker
  accepts any bid, so in a slack market (matches beyond the postings) the print is the lowest bid
  that filled and nothing bounds it below. **§3 step 24-ii** gives the seekers their reservation —
  the outside option the model already pays (`UNEMPLOYMENT_REPLACEMENT_RATE`), defended in real
  terms, so the cost of living is recovered where it is actually recovered and
  `COST_OF_LIVING_PASS_THROUGH` dies with it.
- **D2 / D2.b** — the stickiness is now a consequence of two real things — a firm reprices at its
  own horizon, and the segments and the government pay the rate that was — and of no coefficient.
  It is not yet a consequence of a CONTRACT: there is no agreed wage with a term, no renegotiation
  date, no cost of reopening one (A4: `employeeCount` is an integer on the firm). **§3
  37-EMPLOYMENT**, which lists D2/D2.b; the quit rule's elasticity and the vacancy withdrawal rate
  land there too, since a quit and a withdrawal are what a worker and an employer do to a posting
  they own.

### ❌ B1 — NOBODY DECIDES WHETHER TO WORK

The supply side has a workforce (`laborForceCount`) and a matching function, but no participation
decision. `evolution.ts:251`:

```
const participationDrift = newCycleRegime === 'Recession' ? -0.0003
  : (newCycleRegime === 'Recovery' ? 0.0002 : 0);
```

Participation moves by a stated constant keyed off a regime label, with **the wage nowhere in
it**, and `nonEmployablePct` moves by unseeded noise beside it. So the labour force is exogenous
to its own price: a wage boom draws nobody in and a collapse pushes nobody out, and B1's "and how
much" (hours) does not exist at all — labour is heads, never hours. The discouraged-worker margin,
which is a large part of why measured unemployment lags a recovery, cannot occur.

**§3 step 24-ii** takes the reservation half — a seeker accepts nothing below its outside option,
now that a wage is a price. The participation half — whether a household posts itself at all,
given the wage — stays **37-SMALL**, and the two stated drift constants die with it.

### ⚠️ C2 / C3 — THE ASYMMETRY IS A PAIR OF SPEEDS, NOT A PAIR OF COSTS

C3 is the node the cycle in employment is supposed to come out of. What implements it is
`HIRING_ADJUSTMENT_SPEED_MULTIPLE = 1.1` against `LAYOFF_SPEED_MULTIPLE = 0.6`
(`region-macro.ts:618-619`) — the gap to target closes faster upward than downward. `grep -i
severance src` finds the word **only in two comments**, both of which claim severance and notice
are what produce the asymmetry. No firm ever pays anything to fire anybody, and no firm pays a
search or onboarding cost to hire. So the asymmetry is real in the trajectory and absent from the
P&L: a firm's shed decision costs it nothing, which means labour hoarding through a soft patch is
a speed limit rather than a calculation.

`DISTRESS_LAYOFF_SPEED` (`:621`) is the one place the decision has a cause — a firm that cannot
make payroll sheds — and that one is right. **§3 step 37-EMPLOYMENT**, small, and it belongs beside
step 24 for the same reason A4 does: a severance payment needs an employment relationship to be
severed.

### ✅ F3 — THE FORBID HOLDS, AND IT IS THE STRONGEST NODE IN THE TREE

`reconcileEmploymentView` (`labor-market.ts:830`) computes
`unemploymentRate = max(0, (totalLaborForce − totalEmployed) / totalLaborForce)` from the summed
headcounts of the named firms, the SME pools and the government, with **no cap** (the old 50%
ceiling is gone and the file records why), and it runs twice a week so a default in stage 08
releases its workers the same week. The GDP-gap formula that used to write this number is deleted.
There is no second representation.

One caveat that belongs to a neighbouring tree rather than to F3: `region.nairu` still exists as
a drifting equilibrium concept and is the input to household delinquency
(`evolution.ts:659`, `householdStressSignal = (u − nairu) × 0.02`). The unemployment rate is
measured; what is done with it downstream is still keyed to a written equilibrium. Recorded in
`households.md` under E4.

### ⚠️ A1 / A3 / B3 — WHAT A "PERSON" IS

A worker is a fraction. `employedByOccBefore[occ] += comp.employeeCount * (mix[occ] ?? 0)`
(`labor-market.ts:483`) spreads each firm's headcount across occupations by its **sector's**
fixed mix, so a person is a distribution over five occupations rather than an individual in one,
and `seekers = supplyForOcc − employedBefore + separations` can be negative-in-spirit (the file
deliberately leaves it unclipped so an overshoot is visible, which is the right call). A3 is ⚠️
rather than ✅ for a related reason: heterogeneity is by occupation and region, but a region is
the whole geography, so there is no within-region mismatch and A3.a's simultaneity comes only from
the five occupations.

None of this is a missing mechanism; it is the same aggregation A2.d records in `households.md`,
and it closes there.

*2026-09-05 (§9.20-iii):* the occupations are no longer sealed. A seeker its own occupation could
not place searches the vacancies the others left open, through the same matching function
(`occupationalMobility`), and enters at tenure zero — the bottom of the experience cross-section is
what retraining costs. The labour-force shares are the state that flow moves; the wage-gap drift at
three stated speeds in `evolution.ts` is gone. A3.a's simultaneity survives it: mobility is a
second pass over what the first left, so a shortage is relieved over weeks, not cleared.

### ⚠️ B5 / D4 — TWO VERIFY NODES NOBODY READS

B5 holds by construction — unemployed is defined as `laborForce − employed`, so the identity
cannot fail — which is exactly why it is never checked, and it means a defect in
`laborForceCount` or in the occupation mix would show up as an unemployment rate rather than as a
failed identity. D4's two series are both published (`unemploymentRate`, `vacancyRate`,
`laborMarketTightness`) and nothing ever reads one against the other.

Both are **a measurement, for §3 step 38**.

### Also marked, briefly

- **C1 ⚠️** — a firm posts toward a target headcount from its plan; its bid is bounded by what a head adds only through the affordability rule, not per hire — 37-EMPLOYMENT (a hire is a contract at a wage).
- **E4 ⚠️** — job loss reaches debt service as `(u − nairu) × 0.02`, a region aggregate — `households.md` E4.
