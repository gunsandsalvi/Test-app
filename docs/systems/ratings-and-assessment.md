# SYSTEM: RATINGS AND ASSESSMENT

The judgement of creditworthiness, and what it causes. A rating is not a price and not a
prediction: it is a **published opinion that other parties' rules refer to**, and that reference is
the only reason it has any effect on this world at all.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A RATING IS
- **A1** REASON — an **ordinal judgement** about a named issuer or instrument, published, and
  visible to everyone
- **A2** REASON — it is derived from **observable state**: leverage, coverage, cash, size, sector,
  and the trend in them (`firm-fundamentals.md` D3, `sovereign-credit.md`)
  - A2.a FORBID — **a rating is never derived from the price.** If it reads the spread, it is a
    restatement of the market and cannot disagree with it — which deletes both its information
    content and the feedback in D
- **A3** REASON — it is **coarse and sticky**: a small change in state does not move it, which is
  what makes a move meaningful and what makes it late
- **A4** REASON — it is **an opinion, not a fact**, and it can be wrong — a rated-safe issuer can
  fail (`firm-birth-and-death.md` C)
- **A5** REASON — it is published by a **named assessor**, which is a party with its own incentives

### B. WHAT IT MEASURES
- **B1** REASON — the **probability of failing to perform**, in the sense of
  `../instruments/bond.md` N12
- **B2** REASON — and, separately, the **loss given that failure**, which depends on seniority and
  security (`../instruments/bond.md` N13.a)
  - B2.a so an instrument's rating differs from its issuer's, and both must exist
- **B3** REASON — it is **relative**: an ordering across issuers, which is what makes it usable in
  a rule

### C. WHY IT MATTERS — THE RULES THAT REFER TO IT
- **C1** REASON — **mandates** restrict what a fund, insurer or pension may hold
  (`fund-shares.md` A4, `insurers-and-pensions.md` C5)
  - C1.a so a downgrade past a boundary is a **forced sale by every holder bound by it, at the
    same time** — and that is a real, dated, mechanical flow
- **C2** REASON — **capital charges** depend on it (`banks-capital-and-resolution.md` C), so a
  downgrade consumes a bank's capital without the bank doing anything
- **C3** REASON — **collateral haircuts** depend on it (`money-market.md`,
  `the-derivative-layer.md` D1), so a downgrade reduces how much can be borrowed against the asset
- **C4** REASON — **contract terms** refer to it: covenants, triggers, the right to demand more
  collateral
- **C5** REASON — participants use it as **information** when they have no better

### D. THE FEEDBACK — THE POINT OF THE TREE
- **D1** REASON — C1–C4 mean a downgrade **causes selling, capital pressure and funding loss**
- **D2** REASON — those raise the issuer's **cost of funds** (`corporate-credit.md`,
  `banks-funding-and-liquidity.md`)
- **D3** REASON — which **worsens the state in A2**, which can cause a further downgrade
- **D4** VERIFY — this loop must be **emergent from A2, C and D2** and traceable step by step. It
  is the mechanism behind a cliff edge, and it is precisely what a rating read off the spread
  (A2.a) can never produce, because there the loop is a tautology
- **D5** REASON — it works the other way too: improvement widens the buyer base and cheapens
  funding

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no rating with no consequence.** A published letter that no rule refers to is
  decoration; the whole system is C
- **E2** FORBID — **no rating that changes for no reason.** Every move traces to a change in A2
- **E3** FORBID — **no assessment that is always right.** If a rating never misprices, C1's forced
  sales never surprise anyone and A4 is deleted
- **E4** VERIFY — the distribution of ratings across issuers is a **read** of their states, never
  a target distribution the issuers were fitted to (rule 2)

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent (or, on a FORBID node, the
forbidden thing is there). Every citation is checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 an ordinal judgement about a named issuer, published | `src/domain/company.ts:CreditRating` | ⚠️ |
| A2 derived from observable state | `src/engine/simulation/credit.ts:determineCreditRating` | ✅ |
| **A2.a FORBID a rating is never derived from the price** | `src/engine/simulation/credit.ts:CreditContext` | ✅ |
| A3 coarse and sticky | `src/engine2/stage08-back.ts:forceUpdate` | ✅ |
| A4 an opinion, not a fact, and it can be wrong | `src/engine/simulation/credit.ts:COVERAGE_FLOOR` | ⚠️ |
| **A5 published by a NAMED assessor with its own incentives** | — | ❌ |
| B1 what it measures: the probability of failing to perform | `src/engine/simulation/stages/shared-helpers.ts:computeAnnualDefaultProbability` | ⚠️ |
| B2 and, separately, the loss given that failure | `src/engine/simulation/stages/shared-helpers.ts:creditRecoveryRate` | ⚠️ |
| **B2.a an instrument's rating differs from its issuer's** | — | ❌ |
| B3 it is relative: an ordering across issuers | `src/engine/simulation/credit.ts:peerMedianRevenueUSD` | ✅ |
| C1 **mandates** restrict what a fund, insurer or pension may hold | `src/engine/simulation/stages/asset-allocation.ts:subInvestmentGradeSizeFactor` | ⚠️ |
| C1.a a downgrade past a boundary is a synchronised forced sale | `src/engine/simulation/stages/07b-corporate-bond-clearing.ts:subIG` | ⚠️ |
| C2 **capital charges** depend on it | `src/engine/simulation/stages/asset-allocation.ts:spreadRiskCapitalChargeRate` | ✅ |
| **C3 collateral haircuts depend on it** | `src/engine/simulation/stages/prime-brokerage.ts:measuredHaircutsFor` | ❌ |
| C4 **contract terms** refer to it: covenants, triggers, collateral calls | `src/engine/simulation/stages/corporate-financing.ts:COVENANT_LEVERAGE_CEILING` | ⚠️ |
| C5 participants use it as information when they have no better | `src/engine/simulation/stages/07b-corporate-bond-clearing.ts:companyTerms` | ✅ |
| D1 a downgrade causes selling, capital pressure and funding loss | `src/engine/simulation/stages/07b-corporate-bond-clearing.ts:entitySubIGFactor` | ⚠️ |
| D2 those raise the issuer's cost of funds | `src/engine/simulation/stages/asset-allocation.ts:computeReservationSpreadBps` | ✅ |
| D3 which worsens the state in A2, and can downgrade it again | `src/domain/company-week/credit-standing.ts:creditMetrics` | ⚠️ |
| **D4 VERIFY the loop is emergent and traceable step by step** | — | ❌ |
| D5 it works the other way too | `src/engine/simulation/stages/asset-allocation.ts:subInvestmentGradeSizeFactor` | ✅ |
| **E1 FORBID no rating with no consequence** | `src/engine/macro/evolution.ts:openingSovereignRating` | ❌ |
| E2 FORBID no rating that changes for no reason | `src/engine2/stage08-back.ts:calculatedRating` | ⚠️ |
| E3 FORBID no assessment that is always right | `src/engine/simulation/credit.ts:COVERAGE_FLOOR` | ⚠️ |
| E4 VERIFY the distribution is a read, never a target | `src/engine/bootstrap/firms.ts:ratingFor` | ✅ |

---

## 3. THE DIFF

**25 nodes: 9 ✅, 11 ⚠️, 5 ❌.** The tree's own thesis — *"a published opinion that other parties'
rules refer to, and that reference is the only reason it has any effect on this world at all"* —
is the right frame, and the mapping splits cleanly along it: **what a rating IS** is well built,
**what refers to it** is half built, and **who holds it** does not exist.

### ✅ A2.a — THE ONE FORBID IN THIS TREE THAT THE CODE HONOURS, AND IT MATTERS

Worth stating first because it is the node most likely to have failed. `simulation/credit.ts`'s
`CreditContext` is nine fields — revenue, peer median revenue, customer and supplier concentration,
maturity-wall share, liquidity to debt, revenue volatility, EBITDA — and **not one of them is a
price, a spread or a yield.** `determineCreditRating` puts the firm on a ladder with leverage and
coverage and then notches it by measurements taken elsewhere for other purposes. The seed does the
same thing with the same function (`bootstrap/firms.ts:ratingFor`), so E4 is ✅ too: the opening
distribution is a read of the templates' own states, not a target the templates were fitted to.

The consequence is that the D-loop is *capable* of being real. A rating read off the spread makes
D4 a tautology; this one can genuinely disagree with the market, and `stage08-back.ts:1310-1315`
is built around exactly that disagreement — a multi-notch gap or an IG/HY crossing forces an
immediate re-rate ("fallen angel"), while ordinary drift waits on a 25%-a-week coin flip. A3 is ✅
for the same code.

### ❌ A5 / B2.a / A1 — THERE IS NO ASSESSOR, AND NO INSTRUMENT RATING

**Already §3 step 36** for the core of it ("one rating, held by nobody"). Two things the step does
not currently say and should:

**A5 — nobody publishes it.** There is no rating agency in this model: no party, no fee, no
incentive, no reputation. A rating is a field on the firm, written by the firm's own weekly
kernel. That is why A4 is ⚠️ rather than ✅ — "it can be wrong" needs somebody who can be wrong, and
the only error the model can express is STALENESS (the coin flip), not misjudgement. `E3`'s FORBID
("no assessment that is always right") fails in the same place and for a sharper reason:
`credit.ts:14` sets `COVERAGE_FLOOR = DEFAULT_COVERAGE_FLOOR`, **the very same constant
`credit-standing.ts:isInDefault` triggers on**. So the rater and the default trigger read one
threshold: a firm cannot default while correctly rated above CCC, and the assessment is wrong only
by being late. C1's forced sales can therefore never surprise anyone, which is precisely what E3
says deletes A4.

**B2.a — an instrument has no rating.** `CreditRating` is a `Company` field only; there is nowhere
to put a rating on a `DebtTranche`. B1 and B2 are ⚠️ for the same reason from the other side: the
probability of failure exists (`computeAnnualDefaultProbability`, a real hazard model) and the loss
given failure exists (`creditRecoveryRate`, a real rolling average of what workouts produced) — but
both are per-ISSUER and per-REGION, so **the model has no way to say that a subordinated bond of a
BBB issuer is a worse credit than its senior bond.** That is `corporate-credit.md` G5 and §3 step 33
arriving from the ratings side, and it is why the two steps should be read together.

### ❌ E1 — THE SOVEREIGN RATING HAS NO CONSEQUENCE AT ALL — **NEW**

E1 is the tree's whole point ("a published letter that no rule refers to is decoration") and the
corporate rating survives it: C2 and C5 are real references. **The sovereign rating does not.**
`evolution.ts:70` strikes an opening rating from the real debt ratio and the real deficit, and
`:931-943` re-rates every 26 weeks on the same thresholds — an honest A2-shaped derivation. Then
`grep -rn sovereignRating src` gives its complete consumer list:

```
ui/objects/curve.tsx:47   ui/objects/region.tsx:67   ui/functions/macro.tsx:95
ui/functions/curves.tsx:78   ui/functions/statements.tsx:240
```

**Five UI strings and nothing else.** No mandate reads it, no haircut reads it, no capital charge
reads it, and `07c`'s sovereign book prices entirely off inflation expectations and a duration
premium (`computeSovereignReservationYieldBps`) with no credit term at all — consistent with
`assets/index.ts:71`'s `hasCreditRisk: false`. So a region can be downgraded AAA → BBB and not one
number in the simulation moves. That is decoration by this tree's own definition.

Not in the plan. **Becomes a §3 step**, and it is the same step as `sovereign-credit.md` branch G:
a sovereign rating cannot have a consequence until a sovereign can fail, so the two land together.

### ❌ C3 — HAIRCUTS ARE DERIVED FROM VOLATILITY, NOT FROM THE RATING

`prime-brokerage.ts:47-61`'s `measuredHaircutsFor` returns a haircut per **instrument type** —
`{EQUITY, CORP_BOND, LEVERAGED_LOAN, GOV_BOND, DEFAULT}` — built from the median weekly price move
and the median weekly OAS move across the region's names. `repo-clearing.ts:75`'s
`computeSovereignRepoHaircuts` does the same per tenor bucket, from that bucket's own repricing.
**No issuer's rating enters either.** So a fund holding downgraded paper borrows exactly as much
against it as before, and C3's channel — a downgrade reducing how much can be borrowed against the
asset — does not exist.

This is a real gap and it is **NOT the same as saying the code is wrong**: deriving a haircut from
observed volatility is a better mechanism than indexing it to a letter, and it is what the rest of
this repo's rules ask for. What is missing is that the haircut is per TYPE where it should be per
POSITION: one number for every corporate bond in the region means a CCC name and a AAA name are
equally good collateral. **Becomes a §3 step**, small: the same median-move machinery, computed on
the issuer's own OAS ring rather than the region's median, gets C3's effect with no rating table
anywhere. It is worth doing precisely because it is the one leg of the D-loop that is entirely
absent, and D's whole claim is that a cliff edge is the three legs compounding.

### ⚠️ C1 / C1.a / D1 — THE MANDATE IS A SIZE, AND THAT IS DELIBERATE

`asset-allocation.ts:subInvestmentGradeSizeFactor` and its 40-line rationale are the strongest piece
of reasoning in this area and should be read before anyone "fixes" C1: modelling the mandate as a
PROHIBITION was tried, and it removed 60% of the buyer base from every downgraded name, so B and CCC
paper printed at 50,000bp because there was no level at which demand met supply. The constraint is
now a punitive capital charge plus a modest sleeve limit, which keeps regulated books out of high
yield at normal spreads and leaves a real bid at distressed ones.

So C1 and C1.a are ⚠️, not ❌, and the divergence is narrow: the sleeve factor IS applied at the
IG/HY boundary (`07b:369` `const f = t.subIG ? entitySubIGFactor : 1`), so a crossing does step
every bound holder's target down in the same week — a synchronised flow, executed through the
auction rather than as a dated forced sale. What C1.a asks for beyond that is the **timing**: a real
mandate breach forces a sale within a stated window regardless of price, and here the holder simply
wants less and bids accordingly. Whether that difference matters is a modelling question and the
answer is not obviously "add a forced sale" — record it, do not build it.

### ⚠️ C4 — A RATING-INDEXED LENDING RULE IS NOT A CONTRACT TERM

`corporate-financing.ts:69`'s `COVENANT_LEVERAGE_CEILING: Record<CreditRating, number>` is the only
place in `src` where a rating indexes anything contract-shaped, and it is a **lender's own sizing
rule applied at issuance**, not a term of any instrument. There is no rating trigger, no
ratings-linked coupon step-up, and no right to demand collateral on a downgrade. This is
`corporate-credit.md` B2.a — no covenants exist as instrument terms — seen from the ratings side,
and it is **already §3 step 34**.

### ⚠️ D3 / ❌ D4 — THE LOOP CLOSES ONLY THROUGH NEW BORROWING

D1 → D2 is real: a downgrade widens the reservation through `spreadRiskCapitalChargeRate` and
shrinks the sleeve, and the auction clears wider. D2 → D3 is where it thins out. **Existing debt
never reprices**: `DebtTranche.couponRate` is "locked … never changes until maturity", and
`floatingMarginBps` is locked too — a floater resets against the policy rate, not against its
issuer's credit. So a wider spread reaches the issuer's income statement only through (a) new
issuance, (b) a refinancing at maturity, or (c) a revolver draw at policy + 300bp. That is a real
channel and a slow one, and it is the honest reason this model's credit dynamic is mostly binary.

D4 is ❌ outright: nothing traces the loop. There is no read anywhere that says "this issuer was
downgraded in week N, its spread widened by X, its interest expense rose by Y in week N+M, and its
coverage fell by Z." **A measurement, for §3 step 38**, and the most valuable one this tree could
ask for — D4's own text says the loop is what distinguishes a real rating from one read off the
spread, so it is the measurement that proves A2.a was worth honouring.

### ⚠️ E2 — THE MOVE HAS A REASON; THE WEEK DOES NOT

`stage08-back.ts:1318`: `if (calculatedRating !== L8.creditRating[row] && (forceUpdate || random() < 0.25))`.
Every rating change traces to a change in the ratios, which is what E2 requires. What has no reason
is the TIMING of an ordinary one-notch move: a coin flip, re-thrown weekly, per firm. Real
stickiness is a review cycle and a threshold, not a Bernoulli draw — and the model already has the
better version beside it for the case that matters (`forceUpdate` on a two-notch gap or an IG/HY
crossing). Small, and it belongs with **§3 step 30**'s registry of stated numbers: `0.25` is a
stated shape with an owner and no derivation.
