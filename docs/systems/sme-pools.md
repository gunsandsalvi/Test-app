# SYSTEM: SME POOLS

Small and medium firms, held as pools rather than as individually named parties, and the
securitised claims on them. Two things are going on and both belong here: a **sector of the real
economy** too numerous to model one by one, and a **structured credit instrument** whose whole
purpose is turning many small unrated loans into a few tradable claims.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. THE SECTOR
- **A1** REASON — SMEs are **firms** and satisfy `firm-fundamentals.md`: they sell, employ, borrow
  and can fail
- **A2** REASON — they are represented as a **pool with a distribution**, not as an average
  - A2.a FORBID — **no representative SME.** Default is a threshold event; with one average firm a
    mean-preserving spread causes no defaults, and the entire credit content of the sector is gone
    (`households.md` A2.d is the same argument)
- **A3** REASON — the pool has **observable characteristics**: size, sector, region, leverage,
  coverage — and losses depend on the distribution of those, not the mean
- **A4** REASON — they **employ people** (`labour.md`) and **buy from and sell to** larger firms
  (`trade-credit.md`), so the sector is connected in both directions
- **A5** REASON — they are **bank-dependent**: too small for the bond market
  (`corporate-credit.md`), so `banks-lending.md` is where their funding comes from
  - A5.a which makes them the sector where a credit tightening bites first and hardest

### B. THE LOANS
- **B1** REASON — each is a **loan from a named lender** with a rate, a term and an amortisation
  (`banks-lending.md` C)
- **B2** REASON — they are often **secured** on the firm's assets or the owner's house
  (`housing.md` C1)
- **B3** REASON — they **default**, and the default depends on the individual firm's cash flow
  (`firm-fundamentals.md` D4), aggregated over the pool
- **B4** REASON — **defaults are correlated**: the same rates, the same demand, the same region
  hit all of them
  - B4.a so the pool's loss is **not the sum of independent draws**, and the correlation is what
    makes the tranching in C meaningful or dangerous

### C. THE POOL AS AN INSTRUMENT
- **C1** REASON — the loans are **transferred into a vehicle** — a named party holding them
  (`the-register.md`), funded by issuing claims
- **C2** REASON — the claims are **tranched by seniority**: losses hit the bottom first, and the
  top is protected until the bottom is gone
  - C2.a the tranche boundaries are **stated**, and the loss allocation is a real rule applied to
    real losses
- **C3** REASON — each tranche has a **price that clears** (`the-clearing-engine.md`), and its
  yield is derived from that price (rule 1)
- **C4** REASON — the tranches are **held by named holders**, and that is where the loss actually
  lands (`the-register.md` E3)
  - C4.a often the originating bank keeps the bottom, which means the risk did not leave
- **C5** REASON — the vehicle's **cash flows are the loans' cash flows**: interest and principal
  in, distributed by seniority out
- **C6** VERIFY — Σ tranche values = the pool's value; Σ losses allocated = Σ losses incurred,
  exactly. No tranching creates or destroys loss (rule 3)

### D. WHY IT MATTERS
- **D1** REASON — it **moves credit risk from banks to investors**, and the investors are named
  (`insurers-and-pensions.md`, `fund-shares.md`, `hedge-funds.md`)
- **D2** REASON — it **frees bank capital** (`banks-capital-and-resolution.md`), which lets the
  bank lend again — so securitisation is a lending-capacity mechanism, not just an instrument
- **D3** REASON — the senior tranche is **used as collateral** (`money-market.md`), so its
  liquidity matters to the funding system
- **D4** REASON — when B4's correlation is worse than the tranching assumed, the **senior tranche
  takes losses it was not supposed to**, and every holder in D1 and D3 is affected at once
  - D4.a VERIFY — this must be emergent from B4 and C2, never a scripted event

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no pool without underlying loans to named borrowers.** A pool whose losses come
  from a loss rate has no A3, no B3 and no D4
- **E2** FORBID — **no tranche without a holder** (`the-register.md` A3)
- **E3** FORBID — **no risk transfer without a transferee.** If the bank's exposure fell, somebody
  named picked it up (C4)

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

**The two halves of this tree get opposite answers.** The SECTOR (A, B) is present and, in one
respect, unusually well built: the pool carries a real leverage cross-section and integrates its
distress over it, which is A2.a satisfied on purpose. The INSTRUMENT (C, D, and E2/E3 with them)
**does not exist at all** — there is no vehicle, no tranche, no securitisation of anything anywhere
in `src`.

| Node | Code | |
|---|---|---|
| A1 SMEs are firms and satisfy `firm-fundamentals.md` | `src/engine/simulation/stages/sme-pools.ts:runSmePoolStage` | ⚠️ |
| A2 a pool with a distribution, not an average | `src/domain/region-macro.ts:SmePoolStratum` | ✅ |
| **A2.a FORBID no representative SME** | `src/engine/simulation/stages/sme-pools.ts:coverageDistress` | ✅ |
| A3 observable characteristics; losses follow the distribution | `src/domain/region-macro.ts:SmePool` | ⚠️ |
| A4 they employ, and they trade with larger firms | `src/engine/simulation/stages/labor-market.ts:segmentPostings` | ⚠️ |
| A5 bank-dependent | `src/engine/simulation/stages/bank-lending.ts:smePoolId` | ✅ |
| A5.a a tightening bites here first and hardest | `src/domain/region-macro.ts:blendedMarginBps` | ✅ |
| **B1 each is a loan from a named lender, with a term** | `src/engine/simulation/stages/bank-lending.ts:quoteLoanMarginBps` | ⚠️ |
| **B2 they are often secured** | — | ❌ |
| **B3 default depends on the individual firm's cash flow** | `src/engine/simulation/stages/sme-pools.ts:cashStressIntegral` | ⚠️ |
| B4 defaults are correlated | `src/engine/simulation/stages/sme-pools.ts:recentre` | ⚠️ |
| B4.a the pool's loss is not a sum of independent draws | `src/engine/simulation/stages/sme-pools.ts:distressedFirmShare` | ⚠️ |
| **C1 the loans are transferred into a named vehicle** | — | ❌ |
| **C2 the claims are tranched by seniority** | — | ❌ |
| **C2.a stated boundaries; a real loss-allocation rule** | — | ❌ |
| **C3 each tranche has a price that clears** | — | ❌ |
| **C4 the tranches are held by named holders** | — | ❌ |
| **C4.a the originator often keeps the bottom** | — | ❌ |
| **C5 the vehicle's cash flows are the loans' cash flows** | — | ❌ |
| **C6 Σ tranches = the pool; Σ losses allocated = Σ incurred** | — | ❌ |
| **D1 it moves credit risk from banks to named investors** | — | ❌ |
| **D2 it frees bank capital, so the bank lends again** | — | ❌ |
| **D3 the senior tranche is used as collateral** | — | ❌ |
| **D4 correlation worse than the tranching assumed** | — | ❌ |
| **D4.a and that must be emergent, never scripted** | — | ❌ |
| **E1 FORBID no pool whose losses come from a loss rate** | `src/engine/simulation/stages/bank-lending.ts:loanLossWeeklyUSD` | ❌ |
| **E2 FORBID no tranche without a holder** | — | ❌ |
| **E3 FORBID no risk transfer without a transferee** | — | ❌ |

---

## 3. THE DIFF

### ❌ E1 — THE POOL'S LOSSES ARE A LOSS RATE, AND THE DEBT IT LOSES DISAPPEARS

`bank-lending.ts:243`, run every week against every SME loan in the world:

```
lossUSD = (l.principalUSD * smePoolAnnualPd(seg) * (1 - creditRecoveryRate(reg))) / 52
loanLossWeeklyUSD += lossUSD
return { ...l, principalUSD: l.principalUSD - lossUSD }
```

`smePoolAnnualPd` clamps `seg.defaultRateAnnualPct` to `[0.002, 0.25]`, and that rate is set in
`sme-pools.ts:165` as

```
defaultRateAnnualPct = 0.015 + coverageDistress * 0.04 + cashStressIntegral * 0.06
```

— an affine map from two distress integrals onto a rate, with three stated coefficients and a
**1.5%/yr floor that runs whatever the pool's firms are doing.** This is E1's forbidden shape
exactly, and it drags A3, B3 and the whole of D4 down with it, as the node says it would.

Two consequences that are worse than "a rate instead of an event":

1. **The debt is extinguished with no default and no cash.** `seg.debtUSD` is *derived* from the
   banks' loan rows (`bank-lending.ts:187`), so writing the loans down by `lossUSD` writes the
   pool's debt down by the same amount. Nobody defaulted, nobody was foreclosed on, no asset was
   sold, no recovery was paid — the pool is simply relieved of its liability by arithmetic, and its
   own leverage improves as a result. That is a one-sided flow (rule 14) sitting inside the
   transmission channel A5.a says matters most.
2. **The recovery is a stated rate, not a realisation.** `creditRecoveryRate(reg)` is used as LGD
   here, where the named tier's recovery is what an estate actually fetched
   (`estate.ts:realisedDebtRecoveryRate`). Two definitions of recovery in one model, and the pooled
   one is the one that touches most of the loans.

Not in §3. **Becomes a §3 step**, and it is the same step as `firm-birth-and-death.md` C2.a and E3 —
all three are the one question: *what resolution is an SME?* The cheapest honest answer is probably
to keep the pool but give the strata an absorbing default with a real estate at pool granularity, so
that an exiting weight takes revenue, employment and debt out with it and pays a realised recovery.

### ❌ C1–C6, D1–D4.a — THE INSTRUMENT HALF OF THIS SYSTEM DOES NOT EXIST

Searched: `securitis`, `securitiz`, `CLO`, `ABS`, `SPV`, `senior tranche`, `mezzanine`, `equity
tranche` — **zero hits in `src`.** `engine2/tranches.ts` is the corporate debt ladder, not a
securitisation. There is no vehicle, no claim on a pool, no tranche boundary, no loss waterfall, no
holder of pool risk other than the originating bank, and therefore:

- no channel by which SME credit risk reaches insurers, pension funds, money funds or hedge funds
  (D1) — every dollar of it sits on the bank that wrote it, for ever;
- no capital relief and no lending-capacity mechanism (D2), so a bank's SME origination is bounded
  only by `declinedOriginationUSD`'s regulatory-floor test and can never be expanded by selling risk;
- no senior-tranche collateral in the money market (D3);
- no possibility of D4 at all — the event this system exists to be able to produce, where correlation
  turns out worse than the tranching assumed and every holder is hit at once, has no holders to hit.

E2 and E3 are marked `❌` rather than "satisfied" deliberately: they are vacuous, and a FORBID that
is vacuous is telling you the thing it guards is absent, not that the model is clean.

**MISSING, not out of scope** — the tree's own header says the securitised claim is half of why this
system is a system, and the README's 45 include it. **Becomes a §3 step**, and a large one: it needs
a named vehicle party, a tranche instrument with a cleared price (`the-clearing-engine.md`), a loss
waterfall, and holders. It is also blocked on E1: tranching a loss RATE would produce tranches whose
losses are smooth and whose senior notes can never be touched, which is the one outcome D4 says must
be possible.

### ✅ A2 / A2.a — THE ONE NODE THIS SYSTEM GETS EXACTLY RIGHT, AND IT WAS HARD-WON

`sme-pools.ts:118-146` is worth reading as the counter-example to everything above. The pool carries
`strata` — weights against leverage multiples — recentred each week on the pool's own current
leverage, and its distress is `Σ wᵢ · max(0, 1 − coverage(levᵢ))`, an integral over the cross-section
rather than the function read at the mean. The file states the reason in the node's own terms:
*"`Math.max(0, 1 - coverage)` is a THRESHOLD, and this read it at the pool average — so a pool with
mean coverage 1.2 had exactly ZERO coverage-driven defaults however many of its firms sat below 1,
and a mean-preserving spread could not cause a single default. `E[f(x)]` is not `f(E[x])`."*

The cash term got the same treatment: each stratum's cash is allocated on the residual its own debt
service leaves, so the strata that pay the most interest hold the least. A2.a is satisfied, on
purpose, with the argument written down. Nothing in this diff should be read as saying the pool is a
representative agent — it is not.

### ⚠️ A3 / B4 — ONE DIMENSION HAS A DISTRIBUTION AND EVERYTHING ELSE IS STILL A MEAN

A3 asks for size, sector, region, leverage and coverage, with losses depending on the distribution of
those. `SmePoolStratum` carries **one** field beside its weight: `leverageMultiple`. Sector and region
are the pool's identity, so those are fine; size and coverage are not distributed at all — coverage
is *derived* from leverage through a single pool-wide `annualEarningsUSD` and a single
`poolDebtRateAnnual`, and cash is allocated from one pool balance.

That makes B4's correlation **total by construction, not a modelled property**: every firm in a pool
shares one revenue, one margin, one earnings figure, one debt rate and one cash pile, so the only
thing that distinguishes two firms is where they sit on the leverage axis. B4.a is satisfied ("not
the sum of independent draws") for the wrong reason — there are no draws, and there is no
idiosyncratic component at all. A pool cannot have a bad *year for some of its firms*; it can only
have a bad year. This is what makes D4's scenario unreachable even if C existed. **Becomes a §3
step**, folded into E1's.

### ⚠️ B1 / B2 — ONE LOAN PER BANK PER POOL, WITH NO TERM AND NO SECURITY

`bank-lending.ts:161` originates a single row per `(bank, smePoolId(region, industry))` — priced,
which is real (`quoteLoanMarginBps` off the pool's PD at the bank's own hurdle, and a tightening in
that price genuinely reaches measured pool distress through `blendedMarginBps`, which is A5.a
working). But the node asks for loans to *named borrowers* with a rate, a **term** and an
**amortisation**, and this row has a rate only: it never matures, it never amortises, and it is
reduced only by the loss rate above. So the SME book has no maturity wall, no refinancing risk and
no rollover — the mechanisms by which a credit tightening actually kills small firms.

B2 (security on the firm's assets or the owner's house) is absent outright: `riskWeight: 1.0`, no
collateral, and no link to `housing.md` C1. That link is the one that makes an SME cycle and a
housing cycle the same cycle. Both **become a §3 step**, with E1's.

### ⚠️ A1 / A4 — THEY SELL, EMPLOY AND BORROW; THEY DO NOT FAIL, AND THEY DO NOT LEND

A1 requires SMEs to satisfy `firm-fundamentals.md` — "they sell, employ, borrow and can fail". Three
of four hold and are real: the pool's revenue is measured from its own cleared receipts, it hires
and sheds staff through the same labour market on its own `distressedFirmShare`, it invests out of
cash above a payroll buffer, and it banks and borrows. **It cannot fail** (E1).

A4's second half is also missing: a pool has no trade credit in either direction, because
`05-unit-bidding.ts:2044` books an invoice only when the seller resolves to a named ticker. So the
tier that in reality carries the most trade credit carries none, and `trade-credit.md` D3's
contagion chain terminates the moment it reaches it. Recorded in full in that tree's E1 diff; the
same step closes it.

### ⚠️ A capex rate, noted in passing

`sme-pools.ts:40`: `TARGET_CAPEX_TO_REVENUE = 0.05`, applied as `min(revenue × 0.05, investable
cash × 52)`. That is `the-capital-programme.md` B5's forbidden investment rate again, in the pooled
tier, with a real funding constraint bolted on. It belongs to that tree's B5 step; noted here so the
two are fixed together.
