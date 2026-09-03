# Read `docs/MASTER_PLAN.md` first.

It is the single source of truth for this repo. Its sections, as they actually are:

- **§1 RULES OF ENGAGEMENT** — 29 standing user directives. Read all of them before touching
  anything. The four that get broken most: **§1.12** do not evaluate market behaviour
  mid-project; **§1.20** never roll a derivation back because its print got uglier; **§1.28** a
  tolerance is float dust, never a percentage; **§1.29** fix the cause, not the symptom.
- **§2 THE MAP** — the codebase map, and the legend for what the `§` markers in the code mean
  (read that before chasing one: `§7.N` is a finding id, not a section, and 699 comments carry
  one).
- **§3 THE PROJECT** — **the work order.** The only work list. Ordered; a step leaves here and
  lands in §9 when it is done.
- **§4 THE GATES** — what must be green to commit.
- **§5 LESSONS** — what has been learned and must not be re-learned.
- **§6 WATCHLIST** — measure, do not fix.
- **§8** — a pointer to `docs/AUDIT_ARCHIVE_2026-09-02.md`, the 2026-09-02 sweep as its reviewers
  wrote it. Never re-verified, line numbers long stale: a lead, not a fact.
- **§9 THE LOG** — what is done, why, and the measured numbers.

There is no §7, and there is no second rules file. Anything worth keeping goes in the plan.

## Then `docs/systems/README.md` — the atlas.

Not rules and not a work list: the **reference model**. 45 required trees saying what must exist
for each system to be a system, written from the domain with the code shut, plus the instrument
contracts in `docs/instruments/`. It is the only thing in this repo that can find an ABSENCE — a
sweep reads code and asks whether it is correct, and a missing price has no line number to be read
at (that is why credit had no price and FX did not exist through several full sweeps).

Two things it demands of you:

- **Read the tree for a system before changing that system.** Its FORBID nodes are the ones the
  code cannot tell you about.
- **Update the tree in the same commit as the code.** `scripts/check-atlas.sh` runs inside
  `check-hygiene.sh` and fails when a cited `file:symbol` stops resolving or a source file appears
  in no tree — but it cannot tell you a node has become wrong, so that part is on you.

The plan still governs: the atlas's findings become §3 steps, and mapping it is §3 step 37.
