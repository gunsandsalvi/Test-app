# Read `docs/MASTER_PLAN.md` first. It is the only source of truth here.

**Then take §3's first open step, finish it, and stop.** That is the whole loop: §1 says how, §3
says what, §4 says what must be green, §9 records it in a line. Nothing else in this repo governs.

## The plan, section by section

- **§1 RULES OF ENGAGEMENT** — 19 standing user directives. Read all of them. The five broken most:
  **§1.10** work §3 strictly in order, one step at a time, and a new idea is INSERTED at its right
  position rather than appended; **§1.11** no run, no test, no measurement, no diagnosis until the
  list is finished — the harness is deliberately red and its violations ARE the unbuilt steps;
  **§1.13** never roll a derivation back because its print got uglier; **§1.12** fix the cause;
  **§1.19** READ THE SOURCE, do not re-derive it — where a store holds a fact, read it, and every
  deletion under that rule names the read that replaces it.
- **§2 THE MAP** — the codebase map, and the legend for the `§` markers in the code. Read the
  legend before chasing one: `§7.N` is a FINDING ID, not a section, and ~700 comments carry one.
- **§3 THE PROJECT** — the work order, in eight PARTS, and the only work list. It holds what is
  still OPEN; a finished step is deleted from it.
- **§4 THE GATES** — the five cheap checks that must be green to commit. Nothing else runs.
- **§5 LESSONS** — what has been learned and must not be re-learned.
- **§6 WATCHLIST** — measure, do not fix.
- **§8 THE APPENDICES** — pointers to `docs/AUDIT_ARCHIVE_2026-09-02.md` (the 2026-09-02 sweep as
  its reviewers wrote it) and `docs/LOG_ARCHIVE.md` (the long-form record §9 was compressed from).
  Neither governs. Never re-verified, line numbers long stale: a lead, not a fact.
- **§9 THE LOG** — what is done, why, and the measured numbers. One line per step.

There is deliberately no §7.

## Then `docs/systems/README.md` — the atlas.

Not rules and not a work list: the **reference model**. 45 required trees saying what must exist
for each system to be a system, written from the domain with the code shut, plus 2 instrument
contracts in `docs/instruments/`. It is the only thing here that can find an ABSENCE — a sweep
reads code and asks whether it is correct, and a missing price has no line number to be read at
(which is why credit had no price and FX did not exist through several full sweeps).

Two things it demands of you:

- **Read the tree for a system before changing that system.** Its FORBID nodes are the ones the
  code cannot tell you about.
- **Update the tree in the same commit as the code.** `scripts/check-atlas.sh` runs inside
  `check-hygiene.sh` and fails when a cited `file:symbol` stops resolving or a source file appears
  in no tree — but it cannot tell you a node has become WRONG. That part is on you.

Step 37 (the atlas) is done. Its 114 new findings are grouped into §3 PART VII's `37-*` steps; when one lands,
re-mark its tree's nodes in the same commit.
