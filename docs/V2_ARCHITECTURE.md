# Building an economic simulation so that it stays buildable

*A design document. It describes an architecture for a large agent-based economic simulation —
firms, banks, funds, households, governments, and the instruments and markets that connect them —
written so that new economic depth can be added indefinitely without periodic structural rewrites.*

*This document is self-contained. It cites no code and assumes no familiarity with any particular
implementation. It is a design essay, not a specification and not a governing rule set.*

---

## 0. The two properties everything here serves

Most architecture documents open with a list of virtues — modularity, testability, performance.
Those are consequences, not goals. This design has exactly two goals, and every decision below is
justified by one of them.

**Property 1 — Conservation is structural, not observed.** Value cannot be created or destroyed by
accident, because there is no code path that could do it. Not "we check weekly and it has always
balanced": *there is nothing to check.* No audit harness, no reconciliation pass, no weekly identity
suite. If a system needs a periodic audit to know its books balance, that audit is not a safety net
— it is a receipt for correctness the design failed to build in.

**Property 2 — The agent/instrument coupling is additive, not multiplicative.** Adding a new
instrument (a covered bond, an inflation-linked note, a catastrophe bond) must not require editing
the bank model, the asset-manager model, the insurer model, the household model, or the estate
waterfall. Symmetrically, adding a new *kind of agent* must not require editing any instrument. With
**N** instruments and **M** agent types, the number of places that must know about a new arrival is
**N + M**, never **N × M**.

Property 2 is the one that decides whether a simulation like this is still extensible in year five.
The N×M coupling is what makes a mature model calcify: every new instrument is a two-week project
because eleven agent models each contain a list of what they can hold, and every new agent type is a
two-week project because it must learn eleven instruments. The growth is quadratic and it is
invisible until it is fatal.

---

## 1. The defect classes this is designed against

These are the recurring structural failures in simulations of this kind. They are worth stating
plainly, because each design decision later maps to one of them.

1. **One fact, two representations.** The same quantity is stored in two places (an object field and
   a column; a summary and its parts; a cached total and the rows). Nothing forces them to agree, so
   they diverge, and the divergence is silent because both readings are plausible.
2. **A derived view read as current.** A snapshot is computed at some moment and stored on the same
   object as the authority. Later readers cannot tell the snapshot from the source, so freshness
   becomes a function of position in an execution order that nothing declares.
3. **Untyped identity.** Entity ids, instrument ids, tickers, account keys are all strings, so a
   lookup with the wrong kind of key returns a plausible default (usually zero) rather than failing.
   "This holder owns none of it" and "you asked the wrong question" are the same answer.
4. **Quantity and value share a type.** Face, units, shares, tonnes and money are all numbers, so
   subtracting a price from a face compiles, and a missing quantity can fall back to a value. These
   are equal exactly while the price is par — that is, during precisely the period in which getting
   it wrong costs nothing and is therefore never noticed.
5. **A bound standing in for a missing mechanism.** A clamp is written where a mechanism should be.
   It converts an absence into a plausible number, the number propagates, and the absence becomes
   unobservable. The clamp does not merely hide the bug; it destroys the evidence that names it.
6. **One-legged flows.** Value moves by assigning a field. A field write is syntactically identical
   to a transfer, so value is created and destroyed by ordinary-looking code.
7. **A residual standing in for a holder.** "Households own whatever is left" always balances, and
   therefore can never report that the sum is wrong, and has no counterparty to pay or charge.
8. **Verification that cannot fail.** A check derives both sides from the same source; or is written
   in a language that cannot see its subject (a text search over identifier names); or compares
   against a value that has become undefined, so the comparison is silently false forever. A green
   check and a dead check look identical.
9. **Declared vocabulary nobody produces.** A type says a loan can be `DEFAULTED`; nothing ever
   assigns it. Everyone reading the type — reviewers, later authors, audits — forms a model of a
   system that does not exist. The absence has no line number.
10. **State rebuilt from a fixed field list.** A transition writes a fresh record naming every field.
    The type system cannot tell "recomputed" from "carried", so any field added later is silently
    reset to its default every step.
11. **The same read written many times.** A query is duplicated wherever needed; the copies drift.
    The dangerous copy is not the obviously wrong one — it is the one missing a single clause.
12. **Positional coupling across a boundary.** Data crosses a module or language boundary by ordinal
    position, with names living only in comments. Any insertion or reorder is total corruption that
    produces plausible numbers rather than a crash.

Read as a group, these are not twelve unrelated bugs. They are **one bug**: *the system has more
than one way to say a thing, and no mechanism that makes the ways agree.* Every decision below
removes a way.

---

## 2. The shape

Eight layers, one strictly downward dependency rule, enforced mechanically with an empty exemption
list:

```
kernel  ←  domain  ←  world  ←  ledger  ←  systems  ←  runtime
                                        markets  (beside systems)
                                        surface  (leaf)
```

- **kernel** — storage primitives and nothing economic. The table/column machinery, branded
  identifiers, quantity and money types, the arena, the code generators. It does not know what a
  bond is.
- **domain** — vocabulary and pure arithmetic; no state. One declaration per concept. Zero upward
  dependencies, ever. (In practice, the two things that break this purity are a random-number source
  and seed constants; both must be passed in as capabilities rather than imported ambiently.)
- **world** — one file per table: entities, instruments, schedules, positions, liens, prices,
  accounts, contracts, journal. Each is a schema declaration plus its generated read view.
- **ledger** — the only module that can obtain a writable view of anything. Exports a closed set of
  verbs. This is the whole of Property 1.
- **markets** — price formation. Depends on domain and kernel only, so it can be tested, sharded, or
  compiled separately without dragging the world in.
- **systems** — the model's actual work, one file each. Pure over (read views, a ledger handle, a row
  range). A system may not import another system.
- **runtime** — the step loop, the ordering, the sharding, the profiler.
- **surface** — UI, dumps, reporting. Reads only. Nothing imports it, and there is no path by which
  a display value can be written back into state.

**One rule that matters more than the diagram:** *a system is never moved into the storage layer for
performance.* That single move — relocating a hot piece of logic into the store package because it
needs fast access — is how a clean layering becomes a cycle, and it happens in every codebase that
retrofits columnar storage. When a system needs to be fast, it declares itself fast; it does not
relocate.

---

## 3. Property 1: conservation without a harness

### 3.1 One balance, one writer, one verb

Every conserved thing — money, shares, bond face, physical units, dwellings, plant, permits — is
stored in exactly one structure: a **balance keyed by (holder, asset)**. There is no second place a
quantity may live. No agent has a field for what it holds. No summary total is stored. An agent's
"total assets" is a query, computed on demand, never a number that could be stale.

The only operation that changes a balance is:

```
move(asset, from, to, quantity)
```

It debits and credits **in the same statement**. There is no `setBalance`, no `credit` without a
`debit`, no field to assign. This is not a convention enforced by review — the writable view of the
balance table is obtainable only inside the ledger module, and the ledger exposes only verbs.

The consequence: **the sum of all balances for an asset is invariant by construction.** Not checked
weekly. Not measured to a tolerance. There is no expressible program that changes it. Defect class 6
(one-legged flows) is not detected; it is unwritable.

### 3.2 Creation and destruction are moves, not exceptions

The usual escape hatch is that some things genuinely appear and disappear: a central bank creates
money, a factory creates output, a household consumes it, plant depreciates away. Most designs make
these one-sided operations, and one-sided operations are exactly where conservation stops being
provable and an audit becomes necessary.

Instead, **creation and destruction are moves to and from named counter-accounts that are real rows
in the same table**:

- Money issued by a central bank is a move from `Issue:USD` to the central bank.
- A week's production is a move from `Production:<good>` to the producer.
- Consumption is a move from the household to `Consumption:<good>`.
- Depreciation is a move from the owner to `Wear:<plant-class>`.
- Bond issuance is a move from `Issue:<instrument>` to the buyer, against a money move the other way.

The world's total across *all* accounts, counter-accounts included, is invariant. Nothing was
special-cased.

This is double-entry bookkeeping, and the reason to insist on it is not tradition. It is that the
question a conservation audit exists to answer — *how much of this appeared out of nowhere this
week?* — becomes **a balance you can read**, not a sum you must compute and compare. The signal is
not lost when the audit is removed; it is relocated from a check into the state itself. "The economy
minted 4.2 billion this week" is the delta on `Issue:USD`. If that number is wrong, it is wrong
*visibly*, on a row with a name, owned by a system, rather than as a residue in a reconciliation
report nobody runs.

### 3.3 Integers, because floating point makes the theorem false

Conserved quantities are stored as **integers in the asset's smallest meaningful unit** — cents,
whole shares, whole units, whole square metres. Prices, rates, elasticities and index levels remain
real-valued; quantities do not.

This is not fussiness. With floating-point quantities, `a − q` followed by `b + q` is *not* exactly
conservative, addition is not associative, and the sum of all balances depends on the order you
added them. At that point conservation is no longer a property of the program; it is a measurement
with a tolerance, and a tolerance is a judgement, and a judgement needs a harness to enforce it. The
integer decision is what converts "we audit conservation" into "conservation is a theorem about the
code."

The cost is real and must be paid explicitly: every `price × quantity` produces a real number that
must be quantized to whole units at the point of write, with a **declared rounding rule** and the
rounding residue **explicitly assigned to a party**. You may not round and drop the remainder. That
is ceremony at every valuation, and it is the price of never needing an audit.

A second benefit falls out: because integer sums are order-independent, "run the step with the
entities in reverse order and require identical quantities" becomes a usable check on parallelism
and reordering. (It covers quantities only. Prices and index levels stay real, and any claim that
the whole state is order-independent would be false.)

### 3.4 The door refuses; it does not report

Preconditions live at the write door and **throw at the call site**:

- a non-positive or non-finite quantity,
- a move from a party to itself,
- a move of an asset a party class may not hold,
- a move of units that are encumbered,
- an overdraft on an account not declared overdraftable.

This is the distinction that matters for "no external harness". A **precondition inside the write
door** is part of the mutation: it is always on, it fires at the moment and place of the mistake, and
it names the caller. A **periodic audit over the whole world** is an external harness: it runs
separately, discovers the problem some distance from its cause, and can rot into a check that cannot
fail. The first is kept. The second is designed out of existence.

### 3.5 Encumbrance is a relation, and it is built first

The hardest test of a conservation design is not a bond — it is a **repo**: collateral pledged
against a loan, where the pledgor still owns the asset, the pledgee has a claim on it, and (with
rehypothecation) the same asset can back more than one loan at once.

An encumbrance is two-party, quantity-bearing, and *not* conserved. It fits none of the move verbs.
Modelled as a note on the owner's record, over-pledging is structurally invisible. Modelled as a
transfer, the collateral leaves the pledgor's balance sheet — which is wrong for repo and destroys
the very thing you wanted to count.

So: liens are **rows** in their own table — `(pledgor, beneficiary, asset, quantity, parent-lien)` —
with two derived reads, `encumbered(holder, asset)` and `free(holder, asset) = held − encumbered`,
and `move` refuses to move anything but free units. Rehypothecation is a chain through `parent-lien`.
Over-pledging is unwritable rather than detected.

**Build this at commit zero, before the first store exists, and prove a repo end-to-end on three toy
parties including one rehypothecation hop.** It is the case that decides whether a lien is a row or
a field, and that decision cannot be revisited later without touching everything. Design the
collateral system before the first bond, not after the first margin call.

### 3.6 The journal is a byproduct

Every verb appends a row to a journal: who, to whom, what, how much, at what price, why. The journal
is for **explanation** — showing a user where their money went, attributing a change, debugging a
week. It is explicitly *not* the authority, and state is *not* rebuilt by replaying it.

This is a deliberate rejection of the event-sourcing shape, for a specific reason: if state is a
fold of the log, then comparing the fold against the state proves nothing, because both are the same
function of the same rows. It is the purest form of defect class 8. Keeping the balance authoritative
and the journal derived means the two are *independently produced* — the verb writes the balance from
its arguments and records the instruction separately — so if you ever do want to compare them, the
comparison has content.

The cost, stated honestly: you cannot reconstruct history from the log. A problem that manifests
after a long run is reproduced by re-running from the deterministic seed, not by replaying events.

---

## 4. Property 2: instruments are data, agents are policy

This is the section that decides whether covered bonds are a one-file change.

### 4.1 Why agents normally have to change

An agent model normally contains a list of what it can hold. The bank sums its sovereign bonds, its
corporate bonds, its loans, its cash. The fund allocates across its known asset classes. The insurer
reserves against its known liability types. The estate waterfall ranks its known claim types. Every
one of those lists is an enumeration of instruments *inside* an agent — and every new instrument
must be added to every list. That is the N×M matrix, and no amount of tidy layering removes it,
because the coupling is semantic, not structural.

The fix has three parts.

### 4.2 An agent holds positions, never fields

An agent has no `corporateBondHoldings`. It has positions — rows in the shared balance table — and
everything about its balance sheet is a **query over positions**, computed on demand:

```
totalAssets(agent)  = Σ over positions:  units × price(asset)
```

A new instrument enters that sum the moment somebody holds one, with no edit anywhere. This alone
removes most of the matrix, but only if the discipline is absolute: **the moment any agent stores a
per-class total as a field, the matrix comes back.** No stored aggregates. Ever.

### 4.3 The closed question set

Agents still need to know things about what they hold. A bank needs a risk weight. A fund needs to
know whether an instrument is inside its mandate. A repo desk needs a haircut. An estate needs a
claim rank. If those facts are obtained by asking *what kind of thing is this?* and branching, the
matrix is back.

So the design declares, **once and in one place, the closed set of questions any agent may ask about
any instrument**, and every instrument kind must answer all of them. A representative set:

| Question | Example answers |
|---|---|
| unit of measure and divisibility | shares, face value, tonnes, dwellings |
| how it is quoted | price, yield, spread, rate |
| obligation schedule | rows in the schedule table (see 4.4) |
| who may hold it | party classes |
| claim rank in a wind-up | secured, senior, subordinated, equity |
| collateral eligibility and haircut | eligible at 4%, ineligible |
| accounting treatment | at cost, at market, amortised |
| risk-weight family | sovereign, bank, corporate, secured-retail |
| liquidity tier | level 1, level 2, illiquid |
| where it prices | which venue, which adapter |

This table is a **total mapping**: a compiler error until every kind answers every question. Agents
call `riskWeight(instrument)`, `claimRank(instrument)`, `haircut(instrument)` — they never branch on
kind.

Two properties follow, and the asymmetry between them is the whole point:

- **Adding an instrument is cheap.** One new row. The compiler tells you exactly which answers you
  owe, and when the row is complete every agent already handles it.
- **Adding a *question* is expensive, and visibly so.** A new column breaks every existing kind until
  each one is decided. That is correct: a new question is a new dimension of behaviour, and it
  *should* be a reviewed, deliberate change touching everything.

And a diagnostic rule worth writing on the wall: **a branch on instrument kind outside this table is
a bug report about the table.** It means a question is missing from the closed set. Fix the table, not
the branch.

### 4.4 Obligations are rows, and one system pays them

An instrument's cash flows are **rows in a schedule table**, generated at issuance for the whole life
of the instrument, indexed by due date:

```
(instrument, kind, due-date, basis, amount | rate + index + margin, next-in-chain)
```

Not a periodicity formula. A formula cannot express an irregular schedule, a step-up coupon, a
sinking fund, an amortiser, a make-whole, or a payment holiday — and the moment you need one of those
you special-case the formula, and the special case is exactly where two implementations of the same
rule appear.

One generic system walks the rows due this period and pays whoever holds the instrument. **No agent
contains coupon-collection code.** A covered bond's coupon reaches banks, funds, insurers, pensions
and households with zero lines written in any of them.

This shape also solves a performance problem that otherwise arrives late and hurts: if the weekly
pass walks the *stock* of live instruments, its cost grows with accumulated history rather than with
activity, and a model whose books grow for sixty periods gets steadily slower for reasons that are
hard to attribute. Bucketing by due date makes the pass proportional to **what fires**, not to what
exists.

### 4.5 An agent is four declarations

What actually distinguishes a bank from a hedge fund from a pension fund from a household is not
plumbing. It is:

1. **Mandate** — which assets it may hold, and in what proportions.
2. **Constraints** — the inequalities that bind it, each written as a function of *instrument facts*
   and positions: a capital ratio over risk weights, a liquidity ratio over liquidity tiers, a
   leverage limit, a duration target. Never a function of instrument *kinds*.
3. **Valuation** — how it forms a reservation level for a thing it might buy or sell.
4. **Objective** — what it is trying to do with its money this period.

Everything else — settling, holding, collecting, marking, reporting — is generic machinery it does
not own.

So the symmetric claim holds: **a new agent type is one file**, and it can participate in every
existing market on the day it is written, because participation is expressed through the same four
declarations that every other agent uses.

### 4.6 One market interface

Every market clears the same way: each participant posts a **reservation level and a size it scales
into**, and the venue solves for the level at which demanded quantity meets available supply.

This matters for extensibility more than it looks. Pricing expressed as *"here is the quantity I
want"* has no floor mechanism and therefore produces a shape without a level — and it forces every
market to invent its own price-formation rule, which means every new instrument brings a new pricing
code path. Pricing expressed as a **schedule** is asset-class-agnostic: one solver, one participant
interface, and a new market is an adapter that says who participates and what they are willing to
pay, not a new engine.

There is one structural decision that must be made *before* the first market loop exists, because it
cannot be changed afterwards without rewriting the economics: **how a buyer's budget is shared across
markets.** If agents spend from one wallet across markets opened in sequence, then market order is
economically load-bearing, the markets cannot be evaluated independently, and that part of the model
can never be decomposed or parallelised. If budgets are **pre-allocated per market** before any venue
opens, markets are independent, order stops mattering, and a reconciliation step returns what went
unspent. The second is a real economic simplification — a firm cannot opportunistically move money
between markets mid-period — and it must be argued on its merits. But it must be *decided* up front,
because retrofitting it is a change of behaviour, not a change of representation.

---

## 5. Everything else, briefly

**Identity is typed.** Entity, instrument, account, venue and party identifiers are distinct
nominal types, minted only by named constructors, one per identity space. Maps are keyed by the
branded type. A legitimate crossing between spaces (a company's equity is identified from the company
id) is an explicit named conversion, so crossings are countable. **A lookup miss is an error, never a
default.** "You asked for something that isn't there" and "there is none of it" must not be the same
answer. This is defect class 3, closed.

**Quantities and money carry their unit in the type.** Face, shares, units, tonnes and money in each
currency are distinct types at field and parameter boundaries, and the only route from a quantity to
a value is `quantity × price`. Be honest about the limit: in most languages this protects
*boundaries*, not arithmetic inside a function body, where everything degrades to a number. Anyone
claiming "subtracting a price from a face will not compile" is overselling. A lint rule over mixed-
unit binary arithmetic recovers part of the rest; the remainder is review.

**Value is never stored.** There is no "what this position is worth" column beside "how many units".
Value is `units × price(asset)`, computed at read. Price lives in exactly one place, indexed by
instrument, **including equity and physical goods** — the classes that in most codebases keep their
price as a field on the issuer because they had one before the price store existed. Every read names
which price it wants (this period's close, or the previous one) through the type, so a stale mark is
a different type, not a different value.

**Time is explicit.** Reading a previous period's figure requires asking for it by a different name
that returns a different type, with no method that yields a current figure. A default parameter may
never supply a world-derived quantity — making it required is what stops readers silently taking the
stale path.

**Ordering is declared and checked, not derived.** Each system declares what it reads and writes at
*fact* granularity, and the period's order is a **hand-written, reviewed, committed list**. It is
tempting to derive the order topologically from the declarations; don't. At any granularity you can
realistically declare, most systems read and write the same few things (everyone touches cash), so
the graph is nearly complete and the derived order collapses back to declaration order anyway. Worse,
a topological order is not unique, so adding one system can silently reorder two unrelated ones —
which changes results and forces a re-baseline, the exact move that hides regressions. Declare, order
by hand, and **verify the declarations against what actually happened during a run**, which catches
the real hazard: a system reading something it never said it would.

**Storage is columnar from the first commit.** In simulations of this shape — entity-poor,
mechanism-rich — the arithmetic is a small fraction of the runtime and the *representation* is nearly
all of it: pointer chasing, allocation, string keying, map probes, and rebuilding view objects. There
is no hot loop to optimise; there is a shape to choose. Choose it once, at the start. Retrofitting
columns onto an object model leaves the objects in place as a compatibility view, and rebuilding that
view every period costs more than the pointer-chasing it replaced — a columnar retrofit can measure
*slower* than the thing it replaced, for reasons that have nothing to do with columns.

Related and easy to get wrong: **identifiers should be dense integers assigned in a deterministic
order**, not strings interned on first sight. Dense integers make lookups indexed loads rather than
map probes, make sharding a contiguous row range, and make results reproducible.

**Generate the second representation, never hand-write it.** If a fact must exist in more than one
shape — a native-code layout, a serialisation format, a documentation table — **emit all of them from
one declaration** and check the emitted output in. The failure mode this prevents is a fact that
exists on one side of a boundary and not the other, which produces plausible numbers in the wrong
slots rather than a crash. If you cannot generate both sides of a boundary, do not have the boundary.

---

## 6. What this architecture does *not* guarantee

An architecture document that does not say this is selling something.

- **It cannot tell you the economics is wrong.** A demand schedule with the wrong shape, a policy
  rule with the wrong sign, a badly calibrated elasticity — all of these are structurally perfect and
  economically nonsense. Nothing here helps.
- **It cannot tell you the counterparty was wrong.** Conservation holds when you pay the wrong
  person. Type-level "who may hold what" catches a class of these; it does not catch all of them.
- **It cannot tell you a mechanism is missing.** This is the important one. A missing mechanism has
  no line number: nothing in the codebase says "and no loan ever defaults" or "nothing is ever forced
  to sell." Any review derived *from the code* reproduces the code's blind spots exactly, looks
  thorough, and finds nothing.

  The only instrument that finds an absence is a **reference model written from the domain with the
  code shut**: for each system, what must exist for it to be that system, what must be true, and
  explicitly *what must not exist*. Then compare. This is a document, not a harness — it is read by
  people, and its value is precisely that it was written without looking at the implementation. Two
  disciplines make it work: update it in the same change as the code, and never delete a node to make
  the comparison look better.
- **It does not remove the need to read.** It removes the need to *re-derive*.

And one loss to accept deliberately: **when leaks become impossible, leaks stop being a signal.** In a
system where value can escape, a conservation failure is a cheap and powerful hint that a mechanism
is wrong. Remove the possibility and you remove the hint. The counter-account design (§3.2) is what
buys it back — every creation and destruction flows through a *named* account whose balance you can
read — but you have to actually look at those balances. Put them on the dashboard.

---

## 7. Worked example: adding covered bonds in year six

A covered bond is a bank's bond secured on a ring-fenced pool of its own mortgage loans, where the
pool must be replenished to maintain a cover ratio, and holders have recourse both to the pool and to
the bank. It is a good test because it exercises every joint at once: a new instrument class, a new
schedule shape, a two-party non-conserved relation, a new market, and a claim-rank interaction.

The complete change:

1. **The reference-model entry**, written from the domain with the code shut and committed *first*:
   what must exist, what must be true, and what must not exist ("no pool substitution without
   releasing the outgoing lien").
2. **One new member** in the instrument-kind vocabulary. The compiler now enumerates every decision
   you owe.
3. **One row** in the instrument-facts table: unit is face value, quoted as price, holdable by any
   institutional class, claim rank secured-on-pool, collateral-eligible at some haircut, accounting
   at amortised cost, its own risk-weight family, liquidity tier 2.
4. **Zero new tables.** The bond is a row in instruments; its coupons and principal are rows in the
   schedule table; positions are rows in the balance table; **the cover pool is rows in the lien
   table** — pledgor is the bank, beneficiary is the bond, no parent lien because a cover pool is not
   rehypothecated.
5. **One market adapter**: who may participate and how they form a reservation level. The solver is
   untouched.
6. **One system**, if the cover ratio must be actively maintained: it declares what it reads and
   writes and is inserted at a named position in the period order, with the change visible in review.
   Pool substitution is `release(outgoing)` then `pledge(incoming)`, and an attempt to release below
   the ratio **fails at the call**, not in a later report.

**Files changed in the bank model: zero. In the asset manager: zero. In the insurer, the pension
fund, the household, the estate waterfall, the settlement system, the reporting layer: zero.** They
already price it, hold it, collect its coupons, count it toward their ratios, and rank it correctly
in a wind-up, because none of them was ever written in terms of instrument kinds.

**And the honest exceptions**, because a design that claims no exceptions is lying:

- If covered bonds require a genuinely **new question** — say, a cover-ratio fact that agents must
  respond to — that is a new column in the facts table, and it breaks every existing kind until each
  is decided. That is a deliberate, reviewed, everywhere-change, and it is correct that it is one.
- If a **regulator treats covered bonds specially** in a way that is not expressible as a value of an
  existing fact, that is a change to the bank's *constraint* declaration. That is a bank edit, and it
  is a real one — because it is genuinely a change to what a bank does.
- If covered bonds need a **new conservation law** — a new way for something to be created or
  destroyed — that touches the ledger. They do not. But something eventually will, and that change
  *should* be hard and reviewed, because a new way to mint something is exactly the change that
  deserves scrutiny.

The rule underneath all three: **an instrument is data; a behaviour is code.** New instruments are
free. New behaviours cost. That is the correct cost asymmetry for a model meant to deepen for years.

---

## 8. Build order

The sequence matters as much as the design, because two of the decisions above are unrevisable and
must be settled while they are still cheap.

1. **Storage primitives and nothing economic.** The schema machinery, the arena, branded identifiers
   and quantity types, integer minor units with the quantize-and-assign-the-residue rule, the
   generators, a state differ. No economics at all.
2. **The ledger over four tables** — accounts, positions, liens, journal — with the closed verb set,
   write-door preconditions that throw at the call, and the batch forms (which must exist from day
   one and be reviewed as carefully as the single forms, because they are where a shortcut around the
   door gets added later). **Prove a repo end-to-end on three toy parties, including one
   rehypothecation hop.**
3. **Settle the performance question by measurement, not argument, before writing a single system.**
   State the number that would kill the design in advance — e.g. "if journalling every move costs
   more than X per period at realistic volume, the journal grain must be coarser" — and then measure
   it, on the machine the product actually runs on. Deployment hardware is frequently faster than
   development hardware, and a design tuned to the wrong one is tuned to nothing.
4. **The schedule table and the price column.** Obligations as rows with due-date buckets; one price
   per instrument for every priced thing including equity and goods; every read naming its epoch.
   This is where the long-run cost growth is designed out, before there is a book big enough to grow.
5. **The market solver and one adapter**, plus the **seed expressed as ledger operations** — every
   opening position an issue or a transfer, so the initial state is auditable against an empty world.
   A seeded world assembled by assignment is a world whose opening books were never proved.
6. **The first real systems**, with the budget-allocation question (§4.6) settled *before* the market
   loop is written.
7. **Standing measurement from the first system that produces a period**: a state differ, a
   long-horizon benchmark, and profiling hooks that are permanent members of the system protocol
   rather than instruments added and deleted per campaign. A short benchmark is structurally incapable
   of seeing the cost term that dominates a long run.
8. **Then one system at a time**, always in the same order: reference-model entry written with the
   code shut and committed first, then the rows, then the verbs, then the system.

Steps 1–5 are small — this is a few thousand lines, weeks not months. The model is the expensive
part, and the model is step 8.

---

## 9. The question: is a V2 worth it?

Here is the honest general answer, and then the reasoning, so it can be applied to a specific
situation rather than taken on faith.

### 9.1 The test

Sort the remaining work into three buckets:

- **(a) Missing mechanism** — something the model does not do at all and should.
- **(b) Wrong representation** — the model does the right thing, but stores or expresses it in a way
  that lets it be read wrongly, and the fix is "find the N places that do this and change each one".
- **(c) Wrong number** — a mechanism exists and is calibrated badly.

A rewrite pays for itself when **(b) dominates**, and it does not otherwise. A rewrite builds no
mechanisms and calibrates no numbers; those costs are identical in both worlds. What a rewrite buys
is the elimination of an entire class of (b) work, permanently.

### 9.2 Why (b) work does not converge

This is the crux, and it is worth stating precisely.

The properties this document is built around — *there is exactly one way to write a balance*, *no
agent enumerates instruments*, *no fact has two representations* — are **global invariants**. A global
invariant holds only when the number of violations is **zero**.

Incremental cleanup reduces the count. It cannot hold the count at zero, because nothing structural
prevents violation number 340 from being added next week by a well-meaning change. So the work has a
shape people recognise but rarely name: *you are trying to converge to zero on a quantity that has no
mechanism holding it at zero.* Every fix is local; the property is global; and until the last
violation is gone you get none of the benefit, because the whole value of "there is only one way to
do this" is that you can rely on it without checking.

That is why this kind of backlog gets longer rather than shorter as it is worked. Each step is
genuinely progress and none of it compounds. Meanwhile the codebase keeps growing, so the number of
sites per structural property grows with it, and the cost of the *next* property is higher than the
last.

Two further signals point the same way:

- **You are being asked to build an audit apparatus.** Every conservation check, reconciliation pass
  and weekly identity suite is an admission that some invariant is maintained by discipline rather
  than by construction. The *count* of such checks is a direct measure of how much correctness the
  architecture failed to provide. If that count has been rising, the architecture is losing ground,
  not gaining it.
- **The checks themselves start failing silently.** Dead checks — comparing a thing with itself,
  written in a language that cannot see their subject, passing on an undefined value — appear
  specifically in systems where the checking apparatus has grown large enough that nobody can hold it
  in mind. When you find a green check that could never have failed, that is not a bug to fix; it is
  a reading on the instrument panel.

### 9.3 What a rewrite should and should not be

The rewrite that fails is the one that rebuilds the economics. The domain reasoning in a mature
model — the behavioural rules, the market structures, the accounting, the calibration, the hundreds
of small facts learned by being wrong — is the genuinely expensive asset, and it is usually *correct
as economics and wrong only as representation*. Throwing it away restarts a discovery process that
took years, and that is the classic rewrite disaster.

So the right move is narrower: **rewrite the substrate, port the model.**

Build the kernel, the ledger, the instrument-facts table and the agent interfaces — steps 1–5 above,
which are small — and then port the existing mechanisms one system at a time, translating each from
"mutate fields" to "emit moves." The port is largely mechanical per system, because the target shape
is fixed and known. And critically: **each ported system is correct-by-construction the moment it
lands**, whereas each incremental fix in the old world is correct only until the next writer appears.

The port also does something the incremental path cannot: it forces every mechanism to be *stated* in
the ledger's vocabulary, and anything that cannot be stated is an absence you have just found. That
is a discovery process with a bottom, unlike the backlog.

### 9.4 Doing it without the usual disaster

The predictable failure is that V2 never reaches parity while V1 rots, and eventually you have two
half-systems. Four things prevent it:

1. **Feature-freeze V1** on the day V2 starts. No new mechanisms in the old world — only what a
   shipping build requires. If V1 keeps growing, V2 is chasing a moving target and will lose.
2. **Port in dependency order and keep V1 running until the last system lands.** Money, positions and
   the ledger first; then instruments and schedules; then the agents that use them.
3. **If you do it inside the existing repository** — which is usually right — understand what makes a
   gradual replacement succeed rather than produce a two-headed system. The new package must be
   defined by a **rule** ("nothing may write except through the ledger"), not by a representation
   ("this is where the fast storage lives"). A package named for a representation attracts anything
   that wants to be fast, accumulates the callers those things drag with them, and becomes a second
   system with an import cycle back into the first. A package defined by a rule can only ever grow by
   things that obey the rule.
4. **Set a decision date.** A specific point at which you look at how far the port has got and decide
   whether to continue or stop. Not a deadline — a checkpoint, agreed in advance, so that "this is
   taking longer than expected" becomes a decision rather than a mood.

### 9.5 The precondition

There is one thing that should be tested before committing:

**In the first fortnight, demonstrate the no-harness property on a toy world.** Three parties, one
asset, one bond, one repo with a rehypothecation hop. Show that value cannot leak because there is no
verb that leaks it; show that over-pledging cannot be written; show that creation and destruction are
readable balances on named accounts. It is a small amount of work and it tests the central claim
directly.

If that works, the rest is engineering, and the plan above is a plan.

If it does not — if the ledger needs an escape hatch on day one, if the write door has to be opened
for something ordinary, if conservation turns out to need a tolerance after all — then the rewrite
does not deliver its main benefit, and you are better off continuing to grind the existing system,
because you would be paying rewrite costs for refactor gains.

### 9.6 The short answer

If the remaining backlog is mostly **(b)** — the same structural corrections applied at more and more
sites, with the count going up rather than down, and a growing apparatus of checks to catch what the
structure does not prevent — then **yes, and the longer it is deferred the worse the exchange rate
gets**, because the sites keep multiplying while the substrate stays the same size. Rewrite the
substrate, port the model, freeze the old world while you do it, and prove the central property on a
toy in the first two weeks.

If the remaining backlog is mostly **(a)** — mechanisms that do not exist yet — then no. Build the
mechanisms. A rewrite would not have built them either, and you would arrive at the same place having
also paid for the move.

The question is not "is the current code bad." It is: **is the work you have left the kind that gets
cheaper as you do it, or the kind that gets more expensive?**
