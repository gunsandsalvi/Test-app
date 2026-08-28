# Working rules for this repo

`docs/MASTER_PLAN.md` is the single source of truth for design, work order and history.
These are the operating rules that govern HOW to work, not what to build.

## 1. Do not test the market mid-update

**When a project is underway, build the whole thing before evaluating market behaviour.**

Do NOT, mid-update:
- run `npm run verify` / `scripts/invariants.ts` to see how the economy is behaving
- classify or chase violation counts (NIM bands, escapes, saturation, damper bounds)
- A/B market outcomes to explain a moved number

A change of this kind touches everything. Numbers taken halfway through describe an economy that
does not exist yet, and chasing them wastes the run and fragments the work.

**Do it once, at the end of the update.** That is when the harness, the battery and the
attribution belong.

The narrow exceptions — still not market evaluation:
- `tsc --noEmit` / `npm run build` to confirm it compiles
- a targeted probe that a mechanism I just wrote is WIRED (a field persists, a leg exists,
  a counterparty is present) — a structural check, not a behavioural one

If the user has to say this again, that is a failure. Re-read this file at the start of any
multi-slice project.

## 2. Ask before any long simulation run

Never launch the 260-week harness or a long battery as a routine check.

## 3. Ownership, prices and quantities are outcomes

Never impose a share, a price or a flow that a mechanism should produce. If an aggregate needs a
number, the number comes from the participants' own books and constraints, and the market decides
the rest. A residual with no holder is a defect, not a boundary — see §7's record of
`foreignShare`, `CENTRAL_BANK_SOVEREIGN_SHARE`, and the infinite-supply FX forward.

## 4. No real-world outcomes imported as assumptions

Dollar invoicing dominance, a 24% foreign ownership share, a fixed CB market share: these are
RESULTS of histories this simulation does not have. Model the mechanism and let the outcome fall
out — it may differ, and that is the point of a simulation.

## 5. Every flow has two sides

A security movement has a cash leg. A derivative has a counterparty with a balance sheet and a
finite capacity. A payment leaving one book arrives on another. A one-sided flow is a defect even
when nothing fails.
