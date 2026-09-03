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
  stops existing, and when a stage in `core.ts` or a module in `src/domain` appears in no tree.
  It runs in `check-hygiene.sh`, so it gates every commit.
- **A node is never deleted to make the tree green.** If the model deliberately does not have
  something, the node stays and says so, with the reason. `MISSING` and `OUT OF SCOPE` are
  different answers and the file must distinguish them.
- **The prose side is the user's to review.** It is a list of "this must exist" claims, not code,
  which makes it the cheapest thing in the repo to check.

## Status

| System | Required tree | Mapped | Diff → §3 |
|---|---|---|---|
| [corporate credit](./corporate-credit.md) | ✅ | — | — |

Everything else is unwritten. The atlas is being built system by system; `MASTER_PLAN.md` §3's
parked entry carries the scope estimate (roughly 40–50 systems over 68,788 lines).
