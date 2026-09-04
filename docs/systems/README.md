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
  stops existing, when a stage `core.ts` runs or ANY file under `src` appears in neither a tree nor
  `UNMAPPED`, and when `UNMAPPED` names a file that is gone or one a tree already cites. It runs
  inside `check-hygiene.sh`, so it gates every commit. It proves a citation RESOLVES and nothing
  about whether a mark is TRUE — that half is `test/atlas-marks.test.ts`, which reads every tree
  against itself: each tree node has one row and each row names a node, every diff heading opens
  with a mark and agrees with the row it re-marks, every ⚠️ or ❌ row is argued somewhere in the
  diff, and a tally line counts the table it claims to. Both run on every commit; neither can say a
  node has become WRONG. That part is the reader's.
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
  assigns the outcome directly, which is rule 3's defect wearing the atlas's clothes. So every
  node takes one of three forms, and the form is marked:
  - **REASON** — "it has a cost of funds and a position it wants": checkable, and cannot be
    short-circuited by writing the answer down.
  - **VERIFY** — "worse credit trades wider": a thing to MEASURE, never to enforce. A verify node
    that fails is a finding about the mechanism, not a licence to clamp the number.
  - **FORBID** — "there is no central-bank overdraft for the treasury": a requirement that
    something be ABSENT. These are the nodes a code-derived tree can never contain, because the
    code cannot show you what it should not have.

  If a node is none of the three, it is an outcome, and it does not belong in a required tree.

## The legend, stated once

Every mapping table uses the same three marks, and this is their one definition — a tree does not
restate it:

- `✅` **present** — the node's requirement is met, at the citation.
- `⚠️` **present but diverging** — something answers the node and it is not what the node asks for.
- `❌` **absent** — nothing answers the node; **or, on a FORBID node, the forbidden thing is there**.
  A `❌` row may still carry a citation: it names the nearest thing, or the site where the forbidden
  thing lives, so the reader has somewhere to start.

**Evidence sub-rows.** A node has exactly one primary row. Where a second citation is worth
recording (the seed's half of a check, a second population of the same kind), it is written as
`<id> · <what this row is>` and carries its own mark; it never re-decides the node's.

**Diff headings.** Every entry in §3 THE DIFF opens with the mark it gives the node(s) it names —
`### ❌ E1 / ⚠️ E1.a — …` — and those marks agree with the table. The only unmarked headings are
these titles: *A measurement, for §3 step 38*, *Present and not worth re-checking*, *Scoped out,
deliberately*, *What is solid*, *What this tree found working*, *The rest maps cleanly*, *Also
marked, briefly* (one line per ⚠️/❌ row the longer entries do not reach).

**A diff entry is a diff, not a log.** When a step closes a node, the entry becomes one paragraph
that says what is true now and points at the §9 entry (`closed, §9.13-CREDIT row 3`); what the
commit found and did stays in §9, where rule 16 puts it. A tree that narrates a session is a second
log, and rule 4 applies to prose too.

**"Becomes a §3 step" is not an owner.** A finding names the step that owns it — `§3 step 37-MMF` —
so the plan and the atlas cannot say different things about who closes what. Where the plan holds
several findings in one step (37-SMALL), the tree names the step and the step names the node.

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

**45 of 45 required trees written and 45 of 45 mapped (2026-09-03), plus both instrument
contracts.** The required side was written first and committed first, which is what makes the
mapping mean anything: a node with no citation is a FINDING, and until every system had a required
side, an uncited node could always have been an unwritten tree instead.

Roughly **1,400 nodes** now carry a mark, and every citation resolves on every commit (the gate
prints the live count). The findings are in each file's
§3 THE DIFF, and the ones that became work are in `MASTER_PLAN.md` §3; the ones that were already
known are marked with the step that owns them, so a reader can tell a new gap from an old one.

**What the marks are worth reading for.** A `❌` on a FORBID node is the strongest result this
method produces, because no sweep can find one: the code cannot show you what it should not have.
A `✅` on a FORBID node is worth as much and is easy to overlook — several were verified and hold
(no buyer of last resort in any auction; no netting across counterparties; no short without a
borrow; unemployment as a read of real headcounts), and those are the load-bearing things a future
change must not quietly break.

| # | System | Tree | Mapped | Diff |
|---|---|---|---|---|
| | **INFRASTRUCTURE** | | | |
| 1 | [money and settlement](./money-and-settlement.md) | ✅ | ✅ | ✅ |
| 2 | [the register](./the-register.md) | ✅ | ✅ | ✅ |
| 3 | [the clearing engine](./the-clearing-engine.md) | ✅ | ✅ | ✅ |
| 4 | [the audit](./the-audit.md) | ✅ | ✅ | ✅ |
| 5 | [the seed](./the-seed.md) | ✅ | ✅ | ✅ |
| 6 | [currency and FX rates](./currency-and-fx.md) | ✅ | ✅ | ✅ |
| | **MARKETS** | | | |
| 7 | [corporate credit](./corporate-credit.md) | ✅ d3 | ✅ | ✅ |
| 8 | [sovereign credit](./sovereign-credit.md) | ✅ | ✅ | ✅ |
| 9 | [short-term debt](./short-term-debt.md) | ✅ | ✅ | ✅ |
| 10 | [equity](./equity.md) | ✅ | ✅ | ✅ |
| 11 | [the money market](./money-market.md) | ✅ | ✅ | ✅ |
| 12 | [FX spot](./fx-spot.md) | ✅ | ✅ | ✅ |
| 13 | [fund shares (ETF, MMF)](./fund-shares.md) | ✅ | ✅ | ✅ |
| 14 | [securities lending](./securities-lending.md) | ✅ | ✅ | ✅ |
| 15 | [prime brokerage](./prime-brokerage.md) | ✅ | ✅ | ✅ |
| 16 | [the derivative layer](./the-derivative-layer.md) | ✅ | ✅ | ✅ |
| 17 | [CDS](./cds.md) | ✅ | ✅ | ✅ |
| 18 | [interest-rate swaps](./interest-rate-swaps.md) | ✅ | ✅ | ✅ |
| 19 | [FX forwards and XCS](./fx-forwards-and-xcs.md) | ✅ | ✅ | ✅ |
| 20 | [commodity futures](./commodity-futures.md) | ✅ | ✅ | ✅ |
| 21 | [commodities spot](./commodities-spot.md) | ✅ | ✅ | ✅ |
| 22 | [indices](./indices.md) | ✅ | ✅ | ✅ |
| | **FINANCIAL INSTITUTIONS** | | | |
| 23 | [banks — lending](./banks-lending.md) | ✅ | ✅ | ✅ |
| 24 | [banks — funding and liquidity](./banks-funding-and-liquidity.md) | ✅ | ✅ | ✅ |
| 25 | [banks — capital and resolution](./banks-capital-and-resolution.md) | ✅ | ✅ | ✅ |
| 26 | [dealer desks](./dealer-desks.md) | ✅ | ✅ | ✅ |
| 27 | [insurers and pensions](./insurers-and-pensions.md) | ✅ | ✅ | ✅ |
| 28 | [hedge funds](./hedge-funds.md) | ✅ | ✅ | ✅ |
| 29 | [private equity](./private-equity.md) | ✅ | ✅ | ✅ |
| | **PUBLIC SECTOR** | | | |
| 30 | [the treasury](./the-treasury.md) | ✅ | ✅ | ✅ |
| 31 | [the central bank](./the-central-bank.md) | ✅ | ✅ | ✅ |
| | **FIRMS** | | | |
| 32 | [firm fundamentals](./firm-fundamentals.md) | ✅ | ✅ | ✅ |
| 33 | [the capital programme](./the-capital-programme.md) | ✅ | ✅ | ✅ |
| 34 | [firm birth and death](./firm-birth-and-death.md) | ✅ | ✅ | ✅ |
| 35 | [M&A and corporate control](./m-and-a.md) | ✅ | ✅ | ✅ |
| 36 | [trade credit](./trade-credit.md) | ✅ | ✅ | ✅ |
| | **THE REAL ECONOMY** | | | |
| 37 | [goods](./goods.md) | ✅ | ✅ | ✅ |
| 38 | [freight and logistics](./freight-and-logistics.md) | ✅ | ✅ | ✅ |
| 39 | [labour](./labour.md) | ✅ | ✅ | ✅ |
| 40 | [housing](./housing.md) | ✅ | ✅ | ✅ |
| 41 | [households](./households.md) | ✅ | ✅ | ✅ |
| 42 | [SME pools](./sme-pools.md) | ✅ | ✅ | ✅ |
| | **CROSS-CUTTING** | | | |
| 43 | [cross-border](./cross-border.md) | ✅ | ✅ | ✅ |
| 44 | [ratings and assessment](./ratings-and-assessment.md) | ✅ | ✅ | ✅ |
| 45 | [news and the player surface](./news-and-the-player-surface.md) | ✅ | ✅ | ✅ |

**Instrument contracts** live in [`../instruments/`](../instruments/): a tree whose subject is an
instrument cites one rather than restating it. There are two:
[`bond.md`](../instruments/bond.md) (fourteen characteristics, cited by both credit trees and
short-term debt) and [`derivative.md`](../instruments/derivative.md) (twelve, cited by CDS, IRS,
FX forwards/XCS and commodity futures).

Progress is also measured mechanically: `UNMAPPED` lists every source file not yet in a tree, and
`check-atlas.sh` prints the count on every commit.
