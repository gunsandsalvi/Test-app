# THE SYSTEM ATLAS

One file per system. Each file has three parts, in this order, and the order is the method:

1. **THE REQUIRED TREE** — what must exist for this system to be a system, written from the DOMAIN
   with the code shut. This is the part that does the work. A tree derived from the code
   reproduces the code's blind spots exactly, looks complete, and finds nothing: a credit tree
   built by reading `07d-leveraged-loan-clearing.ts` would have a node for "clear the discount
   margin" and no node for "price", because the file has none. So the required side is written
   first, committed first, and never edited to fit what was found.
2. **THE MAPPING** — one code citation per node, as `` `path/to/file.ts:symbolName` ``. A node with
   no citation is the finding.
3. **THE DIFF** — what is missing, what diverges, and what is present but in the wrong place.
   Each row says whether it is already a step in `MASTER_PLAN.md` §3, and if not, it becomes one.

## Why this exists

Multiple full sweeps of this codebase never reported that credit had no price or that FX did not
exist (user, 2026-09-03). The reason is structural, not effort: **a sweep reads code and asks
whether it is correct, and an absence has no line number to be read at.** Every file in this tree
does something plausible and is heavily commented; nothing in the credit stage says "and there is
no price". A sweep finds defects. Only a reference model finds absences.

## The rules of the atlas

- **The required tree is written from the domain, and the git history proves it.** Each system's
  required tree is committed with every code cell empty, before any mapping is done.
- **A citation is machine-checked.** `scripts/check-atlas.sh` fails when a cited file or symbol
  stops existing, and when a stage `core.ts` runs or a module in `src/domain` appears in neither a
  tree nor `UNMAPPED`. It runs inside `check-hygiene.sh`, so it gates every commit. **What it does
  NOT yet cover, stated here rather than left to be found:** `src/engine2`, `src/engine/ledger`,
  `src/engine/macro`, `src/ui`. Extend it the same way when a tree needs them.
- **A node is never deleted to make the tree green.** If the model deliberately does not have
  something, the node stays and says so, with the reason. `MISSING` and `OUT OF SCOPE` are
  different answers and the file must distinguish them.
- **The prose side is the user's to review.** It is a list of "this must exist" claims, not code,
  which makes it the cheapest thing in the repo to check.
- **NOTHING IN A TREE IS IMPOSED. A node states a REASON, never an OUTCOME** (user, 2026-09-03:
  *"not imposed, a consequence (just apply this comment everywhere)"*). "Surplus banks lend and
  deficit banks borrow" is not a requirement — it is what happens. The requirement is that each
  bank posts a schedule out of its own position, cost and constraints, and **who ends up on which
  side is the result.** A tree written in outcomes reads as complete and then licenses code that
  assigns the outcome directly, which is rule 1's defect wearing the atlas's clothes. So every
  node takes one of three forms, and the form is marked:
  - **REASON** — "it has a cost of funds and a position it wants": checkable, and cannot be
    short-circuited by writing the answer down.
  - **VERIFY** — "worse credit trades wider": a thing to MEASURE, never to enforce. A verify node
    that fails is a finding about the mechanism, not a licence to clamp the number.
  - **FORBID** — "there is no central-bank overdraft for the treasury": a requirement that
    something be ABSENT. These are the nodes a code-derived tree can never contain, because the
    code cannot show you what it should not have.

  If a node is none of the three, it is an outcome, and it does not belong in a required tree.

## Instrument contracts

A tree whose subject is an instrument cites a **contract** rather than restating it:
[`../instruments/bond.md`](../instruments/bond.md) is the fourteen characteristics any bond must have,
and both credit trees satisfy it and state only where their type answers a node differently. This
exists because a sovereign bond and a corporate bond are different TYPES, not one with fields
unused — and because the difference between "this type answers N differently" and "nobody ever
answered N" is the whole point of the atlas.

## Status — 45 systems

"The whole set" is these. The classification is the user's, reviewed 2026-09-03; granularity rule:
**a system is something with its own required tree — its own instrument, actor or mechanism that
could be wholly absent.** That is why banks are three and derivatives are five.

| # | System | Tree | Mapped | Diff |
|---|---|---|---|---|
| | **INFRASTRUCTURE** | | | |
| 1 | [money and settlement](./money-and-settlement.md) | ✅ | — | — |
| 2 | [the register](./the-register.md) | ✅ | — | — |
| 3 | [the clearing engine](./the-clearing-engine.md) | ✅ | — | — |
| 4 | [the audit](./the-audit.md) | ✅ | — | — |
| 5 | [the seed](./the-seed.md) | ✅ | — | — |
| 6 | [currency and FX rates](./currency-and-fx.md) | ✅ | — | — |
| | **MARKETS** | | | |
| 7 | [corporate credit](./corporate-credit.md) | ✅ d3 | ⚠️ stale | ✅ |
| 8 | [sovereign credit](./sovereign-credit.md) | ✅ | — | — |
| 9 | [short-term debt](./short-term-debt.md) | ✅ | — | — |
| 10 | [equity](./equity.md) | ✅ | — | — |
| 11 | [the money market](./money-market.md) | ✅ | — | — |
| 12 | [FX spot](./fx-spot.md) | ✅ | — | — |
| 13 | [fund shares (ETF, MMF)](./fund-shares.md) | ✅ | — | — |
| 14 | [securities lending](./securities-lending.md) | ✅ | — | — |
| 15 | [prime brokerage](./prime-brokerage.md) | ✅ | — | — |
| 16 | [the derivative layer](./the-derivative-layer.md) | ✅ | — | — |
| 17 | [CDS](./cds.md) | ✅ | — | — |
| 18 | [interest-rate swaps](./interest-rate-swaps.md) | ✅ | — | — |
| 19 | [FX forwards and XCS](./fx-forwards-and-xcs.md) | ✅ | — | — |
| 20 | [commodity futures](./commodity-futures.md) | ✅ | — | — |
| 21 | [commodities spot](./commodities-spot.md) | ✅ | — | — |
| 22 | [indices](./indices.md) | ✅ | — | — |
| | **FINANCIAL INSTITUTIONS** | | | |
| 23 | [banks — lending](./banks-lending.md) | ✅ | — | — |
| 24 | [banks — funding and liquidity](./banks-funding-and-liquidity.md) | ✅ | — | — |
| 25 | [banks — capital and resolution](./banks-capital-and-resolution.md) | ✅ | — | — |
| 26 | [dealer desks](./dealer-desks.md) | ✅ | — | — |
| 27 | [insurers and pensions](./insurers-and-pensions.md) | ✅ | — | — |
| 28 | [hedge funds](./hedge-funds.md) | ✅ | — | — |
| 29 | [private equity](./private-equity.md) | ✅ | — | — |
| | **PUBLIC SECTOR** | | | |
| 30 | [the treasury](./the-treasury.md) | ✅ | — | — |
| 31 | [the central bank](./the-central-bank.md) | ✅ | — | — |
| | **FIRMS** | | | |
| 32 | [firm fundamentals](./firm-fundamentals.md) | ✅ | — | — |
| 33 | [the capital programme](./the-capital-programme.md) | ✅ | — | — |
| 34 | [firm birth and death](./firm-birth-and-death.md) | ✅ | — | — |
| 35 | [M&A and corporate control](./m-and-a.md) | ✅ | — | — |
| 36 | [trade credit](./trade-credit.md) | ✅ | — | — |
| | **THE REAL ECONOMY** | | | |
| 37 | [goods](./goods.md) | ✅ | — | — |
| 38 | freight and logistics | — | — | — |
| 39 | labour | — | — | — |
| 40 | housing | — | — | — |
| 41 | [households](./households.md) | ✅ | — | — |
| 42 | SME pools | — | — | — |
| | **CROSS-CUTTING** | | | |
| 43 | cross-border | — | — | — |
| 44 | ratings and assessment | — | — | — |
| 45 | news and the player surface | — | — | — |

**Instrument contracts** live in [`../instruments/`](../instruments/): a tree whose subject is an
instrument cites one rather than restating it. There are two:
[`bond.md`](../instruments/bond.md) (fourteen characteristics, cited by both credit trees and
short-term debt) and [`derivative.md`](../instruments/derivative.md) (twelve, cited by CDS, IRS,
FX forwards/XCS and commodity futures).

Progress is also measured mechanically: `UNMAPPED` lists every source file not yet in a tree, and
`check-atlas.sh` prints the count on every commit.
