# Working rules for this repo

A bottom-up economic simulation. `docs/MASTER_PLAN.md` is the single source of truth for design,
work order, open defects (§6) and the record of what has been learned (§7). **Read §4 (work
order), §5 (the section you are working on), §6 (defects) and §7 before starting.** These rules
govern HOW to work; the plan governs what to build.

---

## 1. Do not test the market mid-update

**When a project is underway, build the whole thing before evaluating market behaviour.**

Do NOT, mid-update:
- run `npm run verify` / `scripts/invariants.ts` to see how the economy is behaving
- classify or chase violation counts (NIM bands, inflation escapes, saturation, damper bounds)
- A/B market outcomes to explain a moved number

A change of this kind touches everything at once. Numbers taken halfway through describe an
economy that does not exist yet; chasing them wastes the run and fragments the work.

**Measure once, at the end of the project.** That is when the harness, the close-out battery and
attribution belong.

Narrow exceptions — these are structural checks, not market evaluation:
- `npx tsc --noEmit` and `npm run build` to confirm it compiles
- a targeted probe that a mechanism you JUST wrote is wired: a field persists, a leg exists, a
  counterparty is present, a book is non-empty

**The harness is currently RED on purpose** (see §6's first row). Do not treat that as a defect
list until XB closes.

## 2. Ask before any long simulation run

Never launch the 260-week harness or a long battery as a routine check. `npm run verify` is 60
weeks and takes ~1 min; a 120-week battery takes ~2 min. Ask before anything longer.

## 3. Ownership, prices and quantities are OUTCOMES

Never impose a share, a price, a flow or a capacity that a mechanism should produce. If an
aggregate needs a number, it comes from the participants' own books and constraints, and the
market decides the rest.

Deleted for exactly this reason, with the record in §7: `foreignShare` (an ownership share owning
nothing — 442B of claims with no holder), forced sovereign placement, the QE/QT "stance" scalar,
`FX_SPOT_PRICE_IMPACT_PER_GDP`, `SPECULATOR_SLOPE_PER_CAPITAL`, `FX_DELTA_HEDGE_EXECUTION_RATE`.

**A residual with no holder is a defect, not a boundary.** A "named gap" is only legitimate with a
size, an owner and a scheduled closing slice — otherwise it is a plug with paperwork.

## 4. No real-world OUTCOMES imported as assumptions

Dollar invoicing dominance, a 24% foreign ownership share, a fixed central-bank market share: all
RESULTS of histories this simulation does not have. Model the mechanism and let the outcome fall
out — it may differ, and that is the point of a simulation. Real-world *primitives* (a tax rate, a
replacement rate, a regulatory ratio) are fine; real-world *equilibria* are not.

## 5. Every flow has two sides

A security movement has a cash leg. A derivative has a counterparty with a balance sheet and
finite capacity. A payment leaving one book arrives on another. **A one-sided flow is a defect
even when nothing fails and every test passes.**

Build both legs in the same pass. Building a two-sided flow one side at a time is how a leg goes
missing (§7.75: cross-border settlement bought euro and never sold the yen).

## 6. Prices are CLEARED, never formulas

All markets go through `src/engine/simulation/stages/financial-clearing-engine.ts`. A participant
posts a `ParticipantDemand`: a reservation level, a `fullSizeStatRange` to scale in over, a
`maxHoldingUSD` cap, a `maxNetPurchaseUSD` cash budget, and a `minHoldingUSD` floor. The solve is
a bisection with **saturation clearing** and a dealer residual.

**A bound is not a price.** If demand cannot absorb the float, clear at the saturation point and
let the dealer carry the rest — never park the print on a clamp. This error has been made and
recorded twice (§7.21, §7.75); do not make it a third time.

## 7. Other standing rules

- **Randomness** only via `src/engine/rng.ts`. Never `Math.random()` in `src/engine` or `src/domain`.
- **Rule 3:** never two representations of one real thing. If a number exists twice, one is wrong.
- **Rule 9:** periodicity is part of the number. Name it (`...WeeklyUSD`, `...Annual`), and a real
  instrument's calendar is part of the model (taxes remit monthly/quarterly, not weekly).
- **§7.4:** the seed's shape must equal the engine's shape — the cold start must use the same
  function the weekly step does, or week 0 and week 1 describe different economies.
- **A clearing stage may only rewrite the instruments it cleared.** Sweeping an entity's whole
  book into one auction deletes positions with no cash leg.
- **Rule 10:** do not chase every moved number. Attribute briefly (one cheap A/B at most), record
  with an owner, move on. This is a partial world.
- **Rule 11 (comments):** brevity. A comment earns its place by saying what the code cannot — the
  mechanism, the measured number, the reason a thing is NOT done the obvious way. Clean up stale
  comments in any file you touch. This applies to `MASTER_PLAN.md` too.

## 8. Known live bugs to fix before closing XB

- **The central bank intervenes in FX with its BOND book** (`fx-clearing.ts` sizes it off
  `centralBankAssetsUSD`, which returns the domestic sovereign portfolio). FX reserves do not
  exist yet — see **XB5** in §5 and the row in §6. This is shipped code, not a gap.

## 9. Git and delivery

- Work on `main` (this session's established practice) unless told otherwise. Commit and push each
  coherent slice.
- **No model identifiers** in commit messages, PR bodies, code comments or any committed artifact.
- Commit messages: what changed, WHY, and the measured numbers. The §7 record gets the same, plus
  the lesson. Both are for a reader who was not here.
- Do not open a PR unless asked.

## 10. Verification commands

```
npx tsc --noEmit        # typecheck — safe any time
npm run build           # build — safe any time
npm run verify          # hygiene + 60-week invariants harness — END OF PROJECT ONLY (rule 1)
npm run profile         # per-stage runtime; stage 05 is 31.0% (183.9ms of 604ms/week)
npx tsx scripts/hh-battery.ts 120     # household close-out battery
npx tsx scripts/pub-battery.ts 120    # public-sector close-out battery
```
