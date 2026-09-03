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

## Status

| System | Required tree | Mapped | Diff → §3 |
|---|---|---|---|
| [corporate credit](./corporate-credit.md) | ✅ 46 nodes | ✅ 32 ✅ / 9 ⚠️ / 5 ❌ | ✅ §3.33–36 |

Everything else is unwritten, and `UNMAPPED` names the 55 pipeline stages no tree covers yet —
its length is the honest measure of how far along this is.

**The pilot's verdict.** The method works, on the test that matters. It was NOT whether the tree
rediscovered "credit has no price" — that was already known, and a tree that only confirms what
you knew proves nothing. It is whether the tree found nodes nobody had raised. It found four:
seniority never reaching the recovery waterfall (which turns out to be the CAUSE of a permanently
failing audit, `P1`), no covenants, no acceleration, and no restructuring. All four came from
writing the required side first and finding the cell empty — none of them would have been found by
reading the credit files, because the credit files do not mention them.

The gate bites, and that was tested rather than assumed: renaming a cited symbol fails the build,
and adding an undescribed stage to `core.ts` fails the build.
