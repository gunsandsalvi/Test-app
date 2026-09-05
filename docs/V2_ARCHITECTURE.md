# Economic Simulation Engine
## Architecture and Project Preparation

---

### Document control

| | |
|---|---|
| **Purpose** | To define the architecture, engineering standards and delivery plan for a new agent-based economic simulation engine, built from scratch. |
| **Audience** | Engineers who will build it, and reviewers who will judge whether the plan is sound. No prior familiarity with any existing system is assumed or required. |
| **Status** | Preparation. Sections 3–17 are proposed and open to challenge. Section 20 lists what must be decided before work starts. |
| **Scope of authority** | This document governs structure and standards. It does not specify economic content; that belongs in per-system specifications (§16.4). |
| **Independence** | This is a greenfield design. No code is carried over from any predecessor, by copy, port or reference. What transfers is knowledge, expressed as specifications (§21.3). |

---

## 1. Executive summary

We are building a discrete-period simulation of an economy: firms that produce and invest, banks
that lend, funds and insurers that allocate, households that work and consume, governments that tax
and spend, and the instruments and markets that connect them. It must run interactively on consumer
hardware, produce reproducible results, and — the point of this document — remain extensible for
years without periodic structural rewrites.

Two architectural requirements drive every decision:

- **A1 — Conservation is structural.** Value cannot be created or destroyed accidentally, because no
  code path exists that could do it. There is no reconciliation pass, no periodic identity suite, no
  audit harness. Correctness of the books is a property of the design, not a result we measure.
- **A2 — Coupling is additive, not multiplicative.** With **N** instrument types and **M** agent
  types, introducing either costs **N + M** knowledge, never **N × M**. Adding a covered bond must
  not require edits to the bank model, the asset-manager model, the insurer, the household or the
  wind-up waterfall. Adding a new class of agent must not require edits to any instrument.

Everything else — the layering, the storage model, the type discipline, the delivery order — is
justified by one of those two, and each section below states which.

The plan is four phases. Phase 1 builds the substrate and proves A1 on a toy world in a fortnight,
with a stated kill criterion. Phases 2–4 build economic content one system at a time, each preceded
by a written specification. Total substrate work is small; the economics is the long pole and is
deliberately sequenced last.

---

## 2. Scope

### 2.1 In scope

A simulation engine covering: entities and their balance sheets; instruments and their obligations;
price formation in multiple markets; production, consumption, employment and investment; credit,
default and wind-up; government and central-bank policy; and a read-only presentation surface.

### 2.2 Non-goals

- **Not a general-purpose framework.** It is one engine for one model. Generality is added when a
  second use case actually appears, not in anticipation.
- **Not a distributed system.** It runs in one process on one device. Parallelism, if any, is
  within-process and is a performance decision (§12), not an architectural one.
- **Not economically prescriptive.** This document fixes how mechanisms are expressed, not which
  mechanisms exist or how they are calibrated.
- **Not a forecasting tool.** Reproducibility and internal consistency are requirements;
  correspondence to any real economy is a modelling ambition, not an engineering guarantee.

---

## 3. Requirements

### 3.1 Functional

| ID | Requirement |
|---|---|
| F1 | Advance the world by one discrete period, deterministically, from a seed. |
| F2 | Hold arbitrary quantities of arbitrary asset classes against arbitrary holders. |
| F3 | Form prices in venues where multiple participants meet, for every priced thing. |
| F4 | Represent obligations with arbitrary schedules — regular, irregular, amortising, indexed, contingent on a declared event. |
| F5 | Represent claims over assets held by another party (pledge, lien, collateral), including chains. |
| F6 | Resolve insolvency: rank claims, distribute an estate, extinguish what cannot be paid. |
| F7 | Persist and restore world state exactly. |
| F8 | Explain any change: for a given quantity and period, what moved it, from whom, and why. |

### 3.2 Architectural requirements

Stated so they can be tested, not admired.

**A1 — Conservation is structural.**
For every conserved asset, the sum of holdings across all holders (including named
counter-accounts, §6.2) is invariant under every operation the engine can perform. The test is not
"we ran it and it balanced." The test is: *name the function that could unbalance it.* If one can be
named, A1 is not met.

**A2 — Coupling is additive.**
Introducing a new instrument type must require changes confined to: one vocabulary entry, one row of
declared facts, its obligation rows, and — only if it trades somewhere new — one market adapter.
Zero edits to any agent model. Introducing a new agent type must require one new file and zero edits
to any instrument. The test is the change-cost table in §17.4: if a proposed feature breaks it, the
architecture has failed, not the feature.

### 3.3 Non-functional

| ID | Requirement | How it is verified |
|---|---|---|
| N1 | **Determinism.** Same seed and same build ⇒ bit-identical state. | Golden-digest test in CI (§11). |
| N2 | **Period budget.** One period completes within a stated wall-clock budget at target scale on the target device. | Standing benchmark from Phase 1 (§12.1). |
| N3 | **Flat cost.** Cost per period must not grow more than a stated percentage across a full-length run. | Long-run benchmark, nightly (§12.1). |
| N4 | **Portability.** Runs on the target consumer platform with no capability that platform lacks. | Platform probe in CI from Phase 1 (§12.4). |
| N5 | **Explainability.** Every change to a conserved quantity is attributable to a recorded instruction. | Structural: the ledger records it (§6.6). |
| N6 | **Reproducible builds of state.** A saved world reloads to a bit-identical state. | Round-trip test (§13). |

N3 deserves emphasis because it is the requirement most often discovered too late. A model whose
books accumulate — contracts, positions, obligations — will get slower every period unless the
per-period work is proportional to *what changes*, not to *what exists*. That is a design decision
(§7.2), not a tuning exercise, and it must be made before the first book grows.

---

## 4. Architecture overview

### 4.1 Layers and the dependency rule

```
kernel  ←  domain  ←  world  ←  ledger  ←  systems  ←  runtime
                                        markets  (beside systems)
                                        surface  (leaf)
```

| Layer | Contents | May import |
|---|---|---|
| **kernel** | Storage primitives, typed columns, identifier machinery, quantity types, code generation. Knows no economics. | nothing |
| **domain** | Vocabulary and pure arithmetic. No state. One declaration per concept. | kernel |
| **world** | One module per table: entities, instruments, obligations, positions, liens, prices, accounts, journal. Schema plus generated read views. | kernel, domain |
| **ledger** | The only module that can obtain a writable view. Exposes verbs. | kernel, domain, world |
| **markets** | Price formation. Deliberately independent of `world` so it can be tested and optimised alone. | kernel, domain |
| **systems** | The model's work, one module each. Pure over (read views, ledger handle, row range). | kernel, domain, world, ledger, markets |
| **runtime** | Period loop, ordering, capability minting, sharding, profiling. | system *declarations* only |
| **surface** | Presentation, reporting, export. Read-only. | world read views, domain |

The rule is enforced by an import-boundary check with an **empty exemption list**. An exemption
list that is allowed to have one entry will have forty.

### 4.2 The rule that protects the layering

*A system is never relocated into a lower layer for performance.*

This is the single most common way a clean layering degrades. Something needs fast access to
storage, so it moves into the storage package; it brings its callers' dependencies with it; the
storage package acquires an upward import; and within a year the two packages are one package with a
cycle. When a system needs to be fast, it **declares** itself fast (§12.3) and stays where it is.

A corollary for naming: **packages are named for their role, never for their representation.** A
package called "storage" or "ledger" can only grow by things that store or post. A package named for
a technique attracts anything using that technique, and becomes a second system.

### 4.3 General principles applied throughout

These are standard and are listed so a reviewer can check them off:

- **One source of truth per fact.** If a value can be derived, it is derived, not stored.
- **Make illegal states unrepresentable** where the type system allows, and fail fast where it does
  not.
- **Pure core, imperative shell.** Decision logic is pure functions over read views; all mutation
  happens through one narrow layer.
- **No ambient state.** No module-scope mutable singletons, no global registries mutated at runtime,
  no hidden clock, no hidden random source. Everything a system needs is passed to it.
- **Explicit module interfaces.** Each module exports a deliberate surface; internals are
  unreachable from outside. "Exported because a test needed it" is not a reason.
- **Generate rather than duplicate.** If a fact must appear in two shapes, one is generated from the
  other and the generated output is committed and reviewed.
- **Total over partial.** Prefer exhaustive mappings the compiler can check to lookups that can miss.

---

## 5. The state model

### 5.1 Tables, not an object graph

World state is a set of **tables of typed columns**: entities, instruments, obligations, positions,
liens, prices, accounts, journal. There is no `Firm` object holding fields. A firm is a row; its
balance sheet is a query.

Three reasons, in order of importance:

1. **A2.** An object with fields invites per-class fields (`corporateBondHoldings`), and per-class
   fields are the N×M matrix in physical form. A table of positions has no place to put one.
2. **A1.** One storage location per fact means the ledger can be the only writer. A field on an
   object is a second location that someone will eventually assign.
3. **Performance.** In simulations of this shape the arithmetic is a small fraction of the runtime
   and the *representation* — allocation, pointer chasing, string keying, rebuilding views — is most
   of it. This is an expectation to validate in Phase 1 (§12.1), not an assumption to build on
   blindly, but it is the strong prior for this class of model.

Consequence to accept deliberately: there is no object to inspect in a debugger. A row inspector
that prints any row by name must exist in Phase 1, or the project is unpleasant to work on. Budget it.

### 5.2 Identity

Every identity space — entity, instrument, account, venue, lien — is a **distinct nominal type**,
minted only by a named constructor, with one module per space owning the constructors. Maps and
columns are keyed by the branded type, and the brand survives array subscripting.

**A lookup miss is an error, never a default.** "There is none of it" and "you asked with the wrong
kind of key" must not be the same answer. A store that returns zero for an unrecognised key converts
a bug into a plausible number, and the plausible number propagates.

Where one space legitimately derives from another — a company's equity is identified from the
company — the crossing is an explicit named conversion, so crossings can be counted and reviewed.

Identifiers are **dense integers assigned in a deterministic order**, not strings interned on first
encounter. Dense integers make lookups indexed loads rather than hash probes, make sharding a
contiguous range, and make results independent of encounter order (§11).

### 5.3 Quantities, units and money

Quantities carry their unit in the type: face value, share counts, physical units, floor area,
and money in each currency are distinct types. **The only route from a quantity to a value is
`quantity × price`.**

State the limit honestly, because overselling this is common: in mainstream languages a branded
number protects **field and parameter boundaries**, not arithmetic inside a function body, where
everything degrades to a plain number. A lint rule over mixed-unit binary arithmetic recovers part of
the remainder. The rest is review. Nobody should claim that subtracting a price from a face value
"cannot compile"; the accurate claim is that it cannot cross a boundary undetected.

### 5.4 No stored value; one price per thing

There is no column recording what a position is worth. Value is `units × price(asset)`, computed at
read. Storing units and value side by side creates two numbers that are equal only at the instant
they are written, and every reader between two writes gets a stale product with no indication.

Prices live in **one table indexed by instrument, for every priced thing** — including equity and
physical goods, which in most designs keep their price on the issuer or the good because they had one
before a price store existed. Every read names *which* price it wants (this period's close, or the
prior one) through the type system, so a stale mark is a different type rather than a different value.

An unpriced instrument returns "not priced" and the caller must handle it. It does not return zero.
Zero multiplies.

---

## 6. The ledger — conservation by construction

*Satisfies A1.*

### 6.1 One balance, one verb

Every conserved thing is stored in exactly one structure: a balance keyed by **(holder, asset)**.
No agent has a holdings field. No aggregate total is stored anywhere.

The only operation that changes a balance is:

```
move(asset, from, to, quantity)
```

It debits and credits in the same statement. There is no setter, no one-sided credit, no writable
field. The writable view of the balance table is obtainable only inside the ledger module; every
other layer receives a read view. Not a convention — a type.

Therefore the sum of balances for an asset is invariant **because no expressible program changes
it**. A1's test is met: there is no function to name.

### 6.2 Creation and destruction are moves

The usual escape hatch is that some things genuinely appear and disappear — a central bank creates
money, a factory creates output, a household consumes it, capital wears out. Most designs make these
one-sided operations, and one-sided operations are exactly where conservation stops being provable.

Instead, creation and destruction are moves to and from **named counter-accounts that are ordinary
rows in the same table**:

| Event | Move |
|---|---|
| Money issued | `Issue:<currency>` → central bank |
| Output produced | `Production:<good>` → producer |
| Goods consumed | household → `Consumption:<good>` |
| Capital depreciating | owner → `Wear:<class>` |
| Security issued | `Issue:<instrument>` → subscriber |
| Debt written off | holder → `Writeoff:<instrument>` |

The total across all accounts, counter-accounts included, is invariant. Nothing is special-cased.

This is double-entry bookkeeping, and the reason to insist on it is not tradition. The question that a
conservation audit exists to answer — *how much appeared from nowhere this period?* — becomes **a
balance you read**, not a sum you compute and compare. Removing the audit does not remove the signal;
it relocates the signal into state. "The economy minted 4.2bn this period" is the change in
`Issue:<currency>`. If that is wrong, it is wrong **visibly**, on a named row owned by a named system.

Put those balances on the operator dashboard. They are the most informative numbers in the system.

### 6.3 Integer quantities

Conserved quantities are **integers in the asset's smallest meaningful unit** — minor currency units,
whole shares, whole physical units. Prices, rates, elasticities and index levels remain real-valued.

This is load-bearing for A1, not a stylistic preference. With floating-point quantities, a debit
followed by a credit is not exactly conservative, addition is not associative, and the total depends
on summation order. Conservation then degrades from a theorem into a measurement with a tolerance;
a tolerance is a judgement; and a judgement needs something to enforce it — which is the audit
harness we are refusing. Integers are what make A1 true rather than aspirational.

Costs, to be paid explicitly:

- Every `price × quantity` yields a real number that must be quantized at the point of write, with a
  **declared rounding rule** and the residue **explicitly assigned to a party**. Rounding and
  discarding the remainder is forbidden; it is a leak.
- Range must be checked once, per asset class, at design time: the largest plausible total in minor
  units must fit the chosen integer representation with margin.

Benefit that falls out: because integer sums are order-independent, "run a period with entities
processed in reverse order and require identical quantities" is a usable check on any reordering or
parallelism. It covers quantities only; prices and index levels remain real, and claiming
order-independence for the whole state would be false.

### 6.4 Preconditions at the door

The verbs reject, at the call site, by raising:

- non-positive or non-finite quantity;
- a move from a party to itself;
- a move of an asset a party class may not hold;
- a move of encumbered units (§6.5);
- an overdraft on an account not declared overdraftable.

This is the distinction that makes "no harness" coherent. A **precondition inside the write door** is
part of the mutation: always on, fires at the moment and place of the mistake, names the caller. A
**periodic pass over the whole world** is an external audit: separated in time and space from the
cause, expensive enough to be made optional, and liable to rot into a check that cannot fail. The
first is kept. The second does not exist in this design.

### 6.5 Encumbrance is a relation, and it is built first

The hardest test of a conservation design is not a bond. It is **collateral**: an asset pledged
against a loan, where the pledgor still owns it, the pledgee has a claim on it, and — with
rehypothecation — the same asset can back more than one obligation at once.

An encumbrance is two-party, quantity-bearing, and not conserved. It fits no move verb. Recorded as
a note on the owner's row, over-pledging is structurally invisible. Recorded as a transfer, the
collateral leaves the pledgor's balance sheet, which is wrong and destroys the thing you wanted to
count.

So liens are **rows in their own table** — `(pledgor, beneficiary, asset, quantity, parent-lien)` —
with two derived reads:

```
encumbered(holder, asset) = Σ liens where pledgor = holder
free(holder, asset)       = held(holder, asset) − encumbered(holder, asset)
```

`move` transfers only free units. Over-pledging is unwritable, not detected. Rehypothecation is a
chain through `parent-lien`, with a declared maximum depth.

**Build this in Phase 1, before the first instrument exists**, and demonstrate a secured loan
end-to-end on three toy parties including one rehypothecation hop. It is the case that decides
whether a lien is a row or a field, and that decision cannot be revisited cheaply. Design the
collateral system before the first bond, not after the first margin call.

### 6.6 The journal is a byproduct

Every verb appends a row: who, to whom, what, how much, at what price, under what reason code. This
satisfies F8 and N5.

The journal is **not the authority**, and state is **not** rebuilt by replaying it. That shape is
tempting and should be refused for a specific reason: if state is a fold of the log, then comparing
the fold to the state proves nothing, because both are the same function of the same rows. It is a
check that cannot fail — the failure mode this whole design is organised against.

Keeping balances authoritative and the journal derived means the two are independently produced: the
verb writes the balance from its arguments and records the instruction separately. Should you ever
want to compare them, the comparison has content.

Cost, accepted: history cannot be reconstructed from the log. A behaviour that emerges late in a run
is reproduced by re-running from the seed (N1 makes this exact), not by replay. Journal retention is
therefore short — a period or two plus saved states — which also keeps memory within N4.

---

## 7. Instruments as data

*Satisfies A2, first half.*

### 7.1 Why agent models normally have to change, and the fix

An agent model normally contains an enumeration of what it can hold: the bank sums its bond types,
the fund allocates across its known classes, the insurer reserves against known liabilities, the
wind-up ranks known claims. Each enumeration must gain a line for every new instrument. That is the
N×M matrix, and no amount of tidy layering removes it, because the coupling is semantic.

The fix has three parts: agents hold positions rather than fields (§8.2); obligations are paid
generically (§7.3); and — the core of it — **there is a closed set of questions an agent may ask
about any instrument, and every instrument type must answer all of them.**

### 7.2 The closed question set

Declared once, in one place, as a **total mapping** from instrument type to answers. Missing an
answer is a compile error.

| Question | Example answers |
|---|---|
| Unit of measure and divisibility | face value, shares, physical units, floor area |
| How it is quoted | price, yield, spread, rate |
| Obligation schedule | rows in the obligations table (§7.3) |
| Which party classes may hold it | institutional only, any, issuer-restricted |
| Claim rank in a wind-up | secured, senior, subordinated, residual |
| Collateral eligibility and haircut | eligible at 4%, ineligible |
| Accounting treatment | at cost, at market, amortised |
| Risk-weight family | sovereign, bank, corporate, secured-retail |
| Liquidity tier | tier 1, tier 2, illiquid |
| Where it prices | venue identifier |

Agents call `riskWeight(instrument)`, `claimRank(instrument)`, `haircut(instrument)`. They never
branch on instrument type.

The cost asymmetry this produces is exactly the one a long-lived model needs:

- **A new instrument is cheap** — one row. The compiler enumerates every answer owed, and once the
  row is complete, every agent already handles it correctly.
- **A new *question* is expensive and visible** — a new column breaks every existing type until each
  is decided. Correct: a new question is a new dimension of behaviour and deserves a reviewed,
  everywhere change.

**Diagnostic rule, to be written on the wall:** *a branch on instrument type outside this table is a
bug report about the table.* It means a question is missing from the closed set. The fix is to add
the question, not the branch. Enforce with a lint rule and treat exceptions as design debt with an
owner.

### 7.3 Obligations are rows, and one system pays them

An instrument's cash flows are **rows in an obligations table**, generated at issuance for the whole
life of the instrument, and indexed by due period:

```
(instrument, kind, due-period, basis, amount | rate + index + margin, next-in-chain)
```

Not a periodicity formula. A formula cannot express an irregular schedule, a step-up coupon, a
sinking fund, an amortiser, a make-whole or a payment holiday — and the first time one is needed, the
formula acquires a special case, and the special case is where a second implementation of the same
rule is born.

**One generic system** walks the rows due this period and pays whoever holds the instrument. No agent
contains coupon-collection code. A new instrument's cash flows reach banks, funds, insurers, pension
funds and households with zero lines written in any of them.

This also satisfies N3. Indexing obligations by due period makes the per-period pass proportional to
**what fires**, not to the accumulated stock of live instruments. A design that walks the stock gets
monotonically slower for reasons that are hard to attribute after the fact.

---

## 8. Agents as policy

*Satisfies A2, second half.*

### 8.1 An agent is four declarations

What distinguishes a bank from a hedge fund from a pension fund from a household is not plumbing. It
is:

1. **Mandate** — which assets it may hold, and in what proportions.
2. **Constraints** — the inequalities that bind it, each expressed over *instrument facts* and
   positions: capital adequacy over risk weights, liquidity coverage over liquidity tiers, leverage,
   duration targets. **Never over instrument types.**
3. **Valuation** — how it forms a reservation level for something it might buy or sell.
4. **Funding policy** — what it does with a surplus or a deficit: issue, borrow, distribute,
   deleverage.

Everything else — settling, holding, collecting, marking, reporting, being wound up — is generic
machinery the agent does not own and does not know about.

### 8.2 An agent holds positions, never fields

An agent has no per-class holdings field. Its balance sheet is a query over the positions table:

```
totalAssets(agent) = Σ over positions of agent:  units × price(asset)
```

A new instrument enters that sum the moment someone holds one, with no edit anywhere — **provided
the discipline is absolute**. The moment any agent caches a per-class total as a field, the N×M
matrix returns through the back door, and it returns silently. No stored aggregates. Ever. If a total
is expensive to compute, that is a storage-layout problem (§12), not a licence to cache it on the
agent.

### 8.3 Adding an agent type

One module declaring the four items above. It can participate in every existing market on the day it
is written, because participation is expressed through the same interfaces every other agent uses.
Zero edits to any instrument, any market, or any other agent.

---

## 9. Markets

### 9.1 One clearing interface

Every venue clears the same way: each participant posts a **reservation level and a size it scales
into**, and the venue solves for the level at which demand meets available supply.

This matters more for extensibility than for realism. Price formation expressed as *"here is the
quantity I want"* has no floor mechanism, produces a shape without a level, and forces every venue to
invent its own rule — which means every new instrument brings a new pricing code path, which is the
N×M matrix again in a different costume. Price formation expressed as a **schedule** is
asset-class-agnostic: one solver, one participant interface, and a new venue is an adapter naming who
participates and how they value, not a new engine.

The solver depends only on `domain` and `kernel` (§4.1) so it can be tested and optimised in
isolation.

### 9.2 Budget allocation across venues — decide before the loop exists

One decision must be made before the first market loop is written, because it is a decision about
economics and cannot be changed later without rewriting behaviour:

**Do buyers spend from a single wallet across venues opened in sequence, or is a budget allocated per
venue before any venue opens?**

- *Single wallet, sequential venues* — richer: an agent can exhaust its funds in one market and be
  genuinely unable to buy in the next. But venue order becomes economically load-bearing, venues
  cannot be evaluated independently, and that part of the model can never be decomposed.
- *Pre-allocated budgets* — venues are independent, order stops mattering, decomposition is
  available, and unspent allocations are returned by an explicit reconciliation step. The cost is
  that agents cannot opportunistically move funds between venues within a period.

Either is defensible. What is not defensible is discovering the question after the loop is written.
**Record the choice as a decision with its rationale (§20) before Phase 3.**

---

## 10. Time, sequencing and capabilities

### 10.1 Periods

The world advances in discrete periods. Within a period, work is done by **systems**: modules with a
single responsibility, each of which may not import another system.

### 10.2 Capabilities are minted from the manifest

Each system declares what it reads and what it writes, at the granularity of named facts rather than
whole tables. The runtime **mints the system's access handles from that declaration**. A system that
did not declare a table has no handle for it and physically cannot touch it.

This is deliberately stronger than declaring and then verifying. Verification of declarations is a
runtime audit — the thing this design refuses — and it can only see what a given run exercises.
Minting makes undeclared access **unrepresentable**, at zero per-access cost, with the check
happening once when the handle is created.

Residual weakness, stated honestly: nothing prevents a system from over-declaring. The counter is a
per-system declaration-width budget reviewed at merge — a social control, not a compiler one. Under
schedule pressure the temptation is to widen the declaration rather than split the system, and
reviewers should watch for exactly that.

### 10.3 Prior-period reads

Reading a previous period's value requires requesting it by a different name, which returns a
**different type** with no method that yields a current figure. A legitimate lagged read and an
accidental stale read are then distinguishable by a compiler rather than by reasoning about
execution order.

**No default parameter may supply a world-derived quantity.** Making such arguments required is what
prevents readers from silently taking the stale path, and it costs nothing.

### 10.4 The order of systems is declared, reviewed and committed

The order within a period is a **hand-written, reviewed, version-controlled list**.

It is tempting to derive it topologically from the read/write declarations. Do not, for three
reasons:

1. **It is degenerate.** At any granularity you can realistically declare, most systems read and
   write the same few things — nearly everything touches cash — so the graph is close to complete and
   the derived order collapses back to declaration order anyway, with the manifest as pure overhead.
2. **It is not unique.** A topological order is one of many valid orders, so adding one system can
   legally reorder two unrelated ones. With price-sensitive dynamics that changes results and forces
   a re-baseline of the golden digest (§11) — and re-baselining is precisely the move under which
   regressions hide.
3. **It hides intent.** "This must run inside the settlement window" is a fact about the model. It
   should be written down, not inferred.

An explicit list is reviewable in a diff, which is the property that matters.

---

## 11. Determinism

*Satisfies N1, and is a precondition for every performance change.*

- **One seeded generator per (stream, entity)**, derived from the world seed. Never one global
  stream consumed in iteration order — that makes every draw dependent on processing order and makes
  reordering impossible.
- **No wall-clock, no ambient randomness, no environment reads** in any layer below `surface`. Time
  is the period counter, passed in.
- **No iteration over unordered containers.** Where order matters, iterate dense integer ranges or
  explicitly sorted keys with a total, stable comparator.
- **Accumulation order is part of the design.** Any sum across entities is either a per-row column or
  a declared accumulator with a stated combination rule; parallel work is combined in shard order,
  never in completion order.
- **A canonical state digest** over all tables, computed on demand, and a **golden-digest test** in
  CI. Alongside it, a **state differ** that reports which fields diverged and by how much — a digest
  alone tells you *that* something changed and is nearly useless for finding out *what*.

Build the differ before the first optimisation, not after. It is the single instrument that is
painful to add late, and it pays for itself the first time it runs.

Note one limit: transcendental functions are not guaranteed bit-identical across platforms and
runtime versions. Define the determinism contract as *identical results for a given build*, not as a
universal constant, and pin the comparison baseline to the build that produced it.

---

## 12. Performance and concurrency

### 12.1 Budgets are requirements, and measurement starts in Phase 1

State N2 and N3 as numbers before writing the systems, and stand up the measurement at the same time:

- an **interleaved A/B benchmark** with a **published noise floor** — differences below the floor are
  reported as unresolved, never as wins;
- a **long-horizon run** exercising N3, because a short profile is structurally incapable of seeing
  the cost term that dominates a long run;
- **profiling hooks as a permanent part of the system interface**, zero-cost when disabled, rather
  than instrumentation added and removed per investigation.

And state, in advance, the number that would **kill** a design decision — for example: *if
journalling every move costs more than X% of the period budget at realistic volume, the journal grain
must be coarser.* A forecast with no falsifying measurement is an opinion.

### 12.2 What to expect, and what to verify

The strong prior for this class of model — entity-poor, mechanism-rich — is that no single hot loop
exists, arithmetic is a small fraction of runtime, and cost is spread across allocation, indirection
and key lookups. If that holds, the levers with real multipliers are *how much structure there is*
and *what shape it is in*, not how fast the arithmetic runs.

Treat that as a hypothesis to confirm with the Phase 1 benchmark. If it is confirmed, the columnar
decision (§5.1) is already collecting the benefit, and further optimisation should target allocation
and lookups before arithmetic.

### 12.3 Concurrency

Default: **single-threaded**. Parallelism is added only against a measured need, and only in one
shape: **contiguous row ranges over shared storage, combined in shard order**. No transport, no
serialisation of entities across a boundary, no per-entity crossing structures.

The rule that matters: **choose one acceleration boundary and put everything through it.** Two
acceleration strategies built against the same seam cannot compose, and a system with a fast
arithmetic path and a fast throughput path that exclude each other ends up shipping with neither
enabled.

If a native or compiled component is ever introduced, its data layout must be **generated from the
same schema as the primary implementation**, with a compatibility identifier checked at load. A
hand-maintained second layout held in step by a comment is a fault waiting for a schedule crunch. If
both sides of a boundary cannot be generated, do not create the boundary.

### 12.4 Platform

Identify the target platform on day one and keep a **platform probe in CI from Phase 1**, so that a
capability the target lacks cannot be depended on silently. Two specific traps: capabilities that
exist in the development runtime but not the deployment one, and imports that break the target build
while all tests continue to pass in the development environment. Also benchmark on target hardware
early — development machines are not always the slower ones, and optimising against the wrong device
optimises against nothing.

---

## 13. Persistence and the seed

*Satisfies F7, N6.*

Because state is tables rather than an object graph, a save is a **dump of columns**, not a traversal:
fast, exact, and free of the "which fields did we forget" class of bug.

- A saved state carries a **schema identifier**. A build whose schema differs refuses to load it and
  says so. During development this is correct behaviour and cheap; a save is regenerated from the
  seed.
- **Round-trip is a CI test**: save, reload, digest, compare.
- Any state that cannot live in a column — variable-length text, nested structures — lives in a
  **declared** secondary region, enumerated explicitly, so that "we compared the whole state" is a
  true statement rather than one that quietly excludes what it could not reach.

**The opening world is built by ledger operations, not by assignment.** Every initial position is an
issue or a transfer from a counter-account. A world assembled by writing balances directly is a world
whose opening books were never proved, and A1 would hold only from period one onward — which is to
say, not at all.

One trap specific to seeding, worth writing into the specification of every seeded instrument:
distinguish an **opening condition** (a price, which the next period re-clears) from **terms** (a
coupon, which is fixed for the life of the instrument). Seeded terms are permanent structure, not an
initial guess, and they should be justified individually rather than drawn from a table by default.

---

## 14. Correctness strategy

The requirement is no external audit harness. That is achievable, but only if "correctness" is
decomposed properly. This is the assurance ladder, strongest first. **Every invariant in the system
must be assigned to a tier, and tier 4 is empty by design.**

| Tier | Mechanism | Cost | Catches |
|---|---|---|---|
| **1. Structural** | Impossible to express: single write path, capability-minted handles, branded types, total mappings. | Zero at runtime. | Conservation, over-pledging, undeclared access, unit confusion at boundaries, missing instrument facts. |
| **2. Build-time** | Compile errors and lint over source: import boundaries, exhaustive matches, mixed-unit arithmetic, vocabulary with no writer, branches on instrument type. | Seconds, every build. | Structural rules a type cannot state. |
| **3. Write-door precondition** | Raises at the call site, always on, in production. | Nanoseconds. | Bad arguments, illegal transfers, encumbered moves, overdrafts. |
| **4. Runtime audit over the whole world** | — | — | **None. This tier does not exist.** |
| **5. Tests** | Fast, deterministic, in CI: unit tests of pure functions; property tests over the ledger verbs; the toy-world conformance suite; the golden digest. | Seconds. | Behavioural regressions, arithmetic mistakes, ordering changes. |

Two clarifications, because they are where this constraint is usually violated in spirit:

**Tests are not a harness.** A harness is a runtime pass over the whole world that measures whether
invariants held during a real run. A test is a deterministic exercise of a small world with a known
answer, run in CI. The first is what we are eliminating; the second is ordinary engineering and we
are doing plenty of it.

**A benchmark is not a harness either.** Measuring speed is not checking correctness, and N2/N3 are
requirements like any other.

### 14.1 The toy-world conformance suite

A handful of parties, one currency, one good, one bond, one secured loan with a rehypothecation hop.
Every ledger verb exercised. It runs in milliseconds and asserts:

- every counter-account balance is exactly the sum of what flowed through it;
- no verb can be found that leaves a balance changed without a paired change elsewhere;
- an attempt to move encumbered units raises;
- a save/reload round trip is bit-identical.

This suite is written in Phase 1, **before** the first economic system, and it is the acceptance test
for the substrate.

### 14.2 What this design cannot do

An architecture document that omits this is selling something.

- **It cannot tell you the economics is wrong.** A demand schedule with the wrong shape, a policy
  rule with the wrong sign, an implausible elasticity — all structurally perfect, all nonsense.
- **It cannot tell you the counterparty was wrong.** Conservation holds when you pay the wrong party.
  Holder-eligibility types catch a class of these; not all.
- **It cannot tell you a mechanism is missing.** This is the important one. An absence has no
  location: nothing in a codebase says "and no borrower ever defaults" or "nothing is ever forced to
  sell." Any review derived *from the code* reproduces the code's blind spots exactly, looks
  thorough, and finds nothing.

  The only instrument that finds an absence is a **specification written from the domain with the
  code shut**: for each system, what must exist for it to be that system, what must be true, and
  explicitly what must *not* exist. Then compare. This is a document read by people, not a harness.
  Two disciplines make it work: it is updated in the same change as the code, and a clause is never
  deleted to make the comparison look better.

- **One loss to accept deliberately:** when leaks become impossible, leaks stop being a diagnostic.
  In a system where value can escape, an imbalance is a cheap and powerful hint that a mechanism is
  wrong. Removing the possibility removes the hint. The counter-account design (§6.2) buys it back —
  every creation and destruction flows through a named, readable balance — but only if someone
  actually looks. Hence §15.3.

---

## 15. Cross-cutting concerns

### 15.1 Parameter provenance

Every numeric constant on a behavioural path is declared in a **parameter registry** carrying: value,
unit, owner, provenance (measured / estimated / assumed / placeholder), and — for placeholders — the
mechanism whose absence it stands in for.

Two rules follow:

- **A bound is not a mechanism.** Clamping a value to a floor or ceiling where a mechanism should be
  converts an absence into a plausible number, and the number propagates. Worse, it destroys the
  evidence that would have named the absence. Where a clamp genuinely is arithmetic impossibility (a
  price cannot be negative), name it as such. Where it is standing in for something unbuilt, register
  it as a placeholder with an owner, and **delete it in the same change that builds the mechanism.**
- **The placeholder count is the honest measure of how much model is missing**, and it should be
  visible on the dashboard next to the counter-accounts.

### 15.2 Error policy

Three categories, handled differently and never conflated:

| Category | Example | Handling |
|---|---|---|
| **Defect** | Lookup miss, illegal transfer, unit mismatch, non-finite value. | Raise immediately with full context. Never a default value, never a logged warning. |
| **Modelled outcome** | Insolvency, failed auction, unfilled order, missing price. | An explicit value in the domain type. Callers must handle it; the compiler enforces that they do. |
| **Environmental** | Save file unreadable, platform capability absent. | Reported to the surface layer; the engine does not continue in a degraded state. |

A non-finite value is a **defect at the point of comparison**, not a falsy result. A comparison
against a non-finite number silently answers "false", which is how a check stops checking without
anyone noticing.

### 15.3 Observability

- **Counter-account balances on the dashboard.** These are the mint-and-destroy readings, and they
  are the closest thing to a conservation report that this design has — by design.
- **The placeholder register**, with its count and its trend.
- **A period trace**: which system ran, how long it took, how many rows it touched. Off by default,
  zero cost when off, permanent.
- **Query-anything row inspector** (§5.1), from Phase 1.

### 15.4 Configuration

Configuration is a value passed in at construction, not read from the environment inside the engine.
Anything read from the environment is a determinism hazard and a portability hazard at once.

---

## 16. Engineering standards

### 16.1 Modules

- One responsibility per module; if the name needs "and", split it.
- An explicit exported surface. Internals are unreachable. "Exported for a test" is not a reason —
  test through the public surface or move the logic.
- No circular imports at any granularity, enforced in CI.
- No module-scope mutable state.

### 16.2 Naming

Names carry the things that mistakes are made of:

- **Unit** — `principalMinorUnits`, not `principal`.
- **Periodicity** — `wageAnnual` / `wagePerPeriod`, never a bare `wage`.
- **Currency or basis** — `valueLocal` vs `valueBase`, never ambiguous.
- **Freshness** — `priceThisClose` / `pricePriorClose`.
- **Derivation** — a computed reader is a verb (`totalAssetsOf`), never a noun that reads like storage.

### 16.3 Review checklist

A change is not approved unless a reviewer can answer yes to all of these:

1. Does every new fact have exactly one storage location?
2. Does every new conserved quantity move only through a verb?
3. Does any new code branch on instrument type outside the facts table? (If yes: which question is
   missing?)
4. Does any agent gain a per-class field or a cached aggregate?
5. Are new constants in the parameter registry with provenance?
6. Does any new clamp stand in for a missing mechanism? Is it registered?
7. Are new reads of world state declared in the system's manifest, and is the manifest no wider than
   necessary?
8. Does the specification for this system still describe what the code does?
9. Is the golden digest change, if any, explained by the intended behaviour change?

### 16.4 Definition of done for a system

1. **Specification written first**, from the domain, with no code open: what must exist, what must be
   true, what must not exist.
2. Tables and vocabulary entries added.
3. Ledger verbs used — no new write path.
4. The system, with its manifest, inserted at a named position in the period order.
5. Tests: unit tests of the pure logic, and a toy-world case if it touches conservation.
6. Specification and code reconciled, in the same change.

---

## 17. Extension playbooks

### 17.1 A new instrument — worked example: covered bonds

A covered bond is a bank's bond secured on a ring-fenced pool of its own loans, where the pool must
be replenished to maintain a cover ratio, and holders have recourse to both the pool and the bank. It
is the right test case because it exercises every joint at once: a new instrument class, a new
schedule shape, a two-party non-conserved relation, a new venue, and a claim-rank interaction.

The complete change:

1. **Specification**, written from the domain, committed first — including what must not exist ("no
   pool substitution without releasing the outgoing lien").
2. **One vocabulary entry.** Every exhaustive match now fails to compile, enumerating the decisions
   owed.
3. **One row of instrument facts:** unit is face value; quoted as price; institutional holders;
   claim rank secured-on-pool; collateral-eligible at a stated haircut; amortised cost; its own
   risk-weight family; liquidity tier 2; venue identifier.
4. **Zero new tables.** The bond is a row in instruments; its coupons and principal are rows in
   obligations; positions are rows in positions; **the cover pool is rows in liens** — pledgor is the
   bank, beneficiary is the bond, no parent lien.
5. **One market adapter**, if it trades somewhere new: who participates, how they value. The solver
   is untouched.
6. **One system**, if the cover ratio is actively maintained: pool substitution is `release` then
   `pledge`, and an attempt to release below the ratio **raises at the call**.

**Edits to the bank model: zero. Asset manager: zero. Insurer, pension fund, household, wind-up,
settlement, reporting: zero.** They already price it, hold it, collect its cash flows, count it
toward their ratios and rank it correctly, because none of them was ever written in terms of
instrument types.

**The honest exceptions**, because a design claiming none is lying:

- If the instrument requires a **new question** agents must respond to (a cover-ratio fact), that is
  a new column, and it breaks every existing type until each is decided. Deliberate and correct.
- If a regulator treats it specially in a way no existing fact expresses, that is a change to the
  bank's **constraint** declaration — a real bank edit, correctly, because it is genuinely a change
  to what a bank does.
- If it requires a **new conservation law** — a new way for something to be created or destroyed —
  that touches the ledger. Covered bonds do not. Something eventually will, and that change should be
  hard and reviewed.

The rule underneath all three: **an instrument is data; a behaviour is code.** New instruments are
free. New behaviours cost, and should.

### 17.2 A new agent type

One module: mandate, constraints, valuation, funding policy (§8.1). It trades everything that exists
on the day it is written. Zero edits elsewhere.

### 17.3 A new venue

One adapter naming participants and how they value, plus a venue identifier on the instrument facts
of anything that trades there. The solver is untouched.

### 17.4 Change-cost table

This is the contract. If a proposed change does not fit here, the architecture has a gap and the gap
is the finding.

| Change | Vocabulary | Facts table | Tables | Ledger | Agents | Markets | Systems |
|---|---|---|---|---|---|---|---|
| New instrument type | 1 entry | 1 row | 0 | 0 | **0** | 0–1 adapter | 0–1 |
| New agent type | 0–1 entry | 0 | 0 | 0 | 1 new module | 0 | 0 |
| New venue | 0 | field on affected rows | 0 | 0 | **0** | 1 adapter | 1 |
| New obligation shape | 0 | 0 | 0 | 0 | **0** | 0 | 0 |
| New *question* about instruments | 0 | **1 column × every type** | 0 | 0 | consumers of it | 0 | 0 |
| New conservation law | 1 entry | 1 row | 0–1 | **1 verb** | **0** | 0 | 1 |

---

## 18. Delivery plan

Phases have **entry and exit criteria**. A phase is not finished because time has passed.

### Phase 1 — Substrate

*Exit criteria: the toy-world conformance suite (§14.1) passes, the benchmark exists with a published
noise floor, and the state differ works.*

Storage primitives; branded identifiers and quantity types; integer minor units with the
quantize-and-assign rule; code generation; the state differ and row inspector; the ledger over four
tables (accounts, positions, liens, journal) with the closed verb set and write-door preconditions;
the batch forms of every verb — written now and reviewed as carefully as the single forms, because
batching is where a bypass gets added later; the platform probe.

**Kill criterion, stated in advance:** if the ledger requires an escape hatch for an ordinary
operation, or if journalling costs more than the stated share of the period budget at realistic
volume, the design's central claim has failed and the plan must be revised before Phase 2. Measure
this, on target hardware, at the end of Phase 1.

### Phase 2 — Instruments, obligations and prices

*Exit criteria: an instrument can be issued, held, priced, and pay a full irregular schedule to
multiple holder classes, with no holder-specific code.*

The instrument facts table as a total mapping; obligations as rows with due-period indexing; the
price table with epoch-typed reads; the market solver and one adapter; the opening world built by
ledger operations.

### Phase 3 — First agents and the period loop

*Exit criteria: a period runs end to end with two agent classes; the golden digest is stable; the
budget-allocation decision (§9.2) is recorded.*

Systems and manifests; capability minting; the period order as a committed list; two agent types
(one intermediary, one allocator) implemented purely as the four declarations.

### Phase 4 — Economic content

*Exit criteria: per system, the §16.4 definition of done.*

One system at a time, specification first. Sequence by dependency: money and settlement, then credit,
then equity, then the public sector, then the remaining sectors. Throughout, the standing benchmark
(N2) and the long-run benchmark (N3) run nightly.

**Native or parallel acceleration is not in the plan.** It is considered only if the standing
benchmark demands it, and only under §12.3.

---

## 19. Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | Integer quantities prove awkward for some asset class; team is tempted to make an exception. | A1 fails silently; the audit harness returns. | Range analysis per class in Phase 1. An exception requires a written decision naming what replaces A1 for that class. |
| R2 | Phase 1 substrate over-engineers ahead of need. | Schedule loss; complexity with no consumer. | Exit criteria are behavioural, not feature lists. Anything not exercised by the toy suite is deferred. |
| R3 | Agents acquire cached aggregates for performance. | N×M returns invisibly. | Review checklist item 4; a lint rule on agent modules; treat as a storage-layout problem instead. |
| R4 | Manifests are over-declared under deadline pressure. | Ordering hazards return. | Declaration-width budget reviewed at merge; visible in the diff. |
| R5 | Specifications drift from code. | The only instrument that finds absences stops working. | §16.4 requires reconciliation in the same change; a stale specification blocks approval. |
| R6 | The golden digest is re-baselined casually. | Regressions hide inside intended changes. | A digest change must name which field families moved and why; reviewer signs off on that list, not on the digest. |
| R7 | Performance target missed late, after the model exists. | Expensive rework of storage decisions. | Benchmarks from Phase 1; N3 measured on a long run, nightly, from Phase 3. |
| R8 | Greenfield never reaches useful scope. | Total loss. | Phase exit criteria; a scope review at the end of Phase 2 with an explicit continue/stop decision. |
| R9 | Economic knowledge is re-derived ad hoc rather than specified. | Known problems are re-encountered as new ones. | Specifications are written before each system and are the transfer mechanism (§21.3). |

---

## 20. Decisions required before Phase 1

These are open and must be resolved, in writing, with rationale:

1. **Language and runtime**, given N4's target platform.
2. **Integer width and unit per asset class**, with range analysis (R1).
3. **Rounding rule** for quantization, and the party to whom residues are assigned (§6.3).
4. **The initial closed question set** for instruments (§7.2) — its first version, and the process for
   adding to it.
5. **The verb set** — the minimal closed list, and the review process for extending it.
6. **Budget allocation across venues** (§9.2) — required before Phase 3, decided ideally before
   Phase 2.
7. **Period budget and flat-cost tolerance** — the actual numbers for N2 and N3.
8. **Rehypothecation depth limit** (§6.5).
9. **Journal retention policy** and its memory budget under N4.

---

## 21. Basis for the decision: greenfield rather than continued remediation

This section exists so that the choice is recorded with its reasoning, and so that the conditions
under which it would have been the wrong choice are written down in advance.

### 21.1 The test that decides it

Sort the outstanding work on any existing system into three categories:

- **(a) Missing mechanism** — something that should be modelled and is not.
- **(b) Wrong representation** — the right thing is done, but expressed so that it can be read wrongly;
  the fix is "find the N places that do this and change each one."
- **(c) Wrong number** — a mechanism exists and is calibrated badly.

A rebuild pays only when **(b) dominates**. It builds no mechanisms and calibrates nothing; those
costs are identical either way. What it buys is the permanent elimination of a class of work.

### 21.2 Why (b) does not converge

The properties this document is built on — *exactly one way to write a balance*, *no agent enumerates
instruments*, *no fact has two representations* — are **global invariants**. A global invariant holds
only at zero violations.

Incremental cleanup reduces the count; it cannot hold it at zero, because nothing structural prevents
the next violation being added tomorrow. So the work has a shape that is recognisable but rarely
named: *converging to zero on a quantity with no mechanism holding it at zero.* Each step is real
progress and none of it compounds, because the entire value of "there is only one way to do this" is
that you can rely on it without checking. Meanwhile the system grows, so the number of sites per
property grows with it, and each property costs more than the last.

Two observable signals say the same thing. First, **being required to build an audit apparatus at
all**: every reconciliation pass is an admission that an invariant is maintained by discipline rather
than by construction, and the count of such passes measures how much correctness the architecture
failed to supply. Second, **checks that cannot fail** — comparing a value with itself, testing a
condition that has become undefined, matching text patterns that no longer match anything. These
appear specifically once the checking apparatus is too large to hold in mind, and finding one is not
a bug to fix; it is a reading on the instrument panel.

### 21.3 Why nothing is ported

The instinct is to carry the economics across and rebuild only the substrate. It is rejected here,
and the reason is architectural rather than aesthetic:

**Ported code carries the assumptions it was written under.** A system written against mutable
objects, stored aggregates and per-class fields arrives expressing exactly the shapes this design
exists to eliminate, and the path of least resistance is to add an accommodation for it. Since the
entire benefit is a *global* property (§21.2), a single accommodation costs more than the port saves.
Code is the main vector by which old invariants return.

What transfers instead is **knowledge, as specification**. Every mechanism worth keeping is written
down as a specification — from the domain, in domain language, with no implementation open — and
built fresh from that. This is the same artefact that §14.2 requires anyway as the only instrument
capable of finding absences, so the cost is not additional: it is work that must happen regardless,
sequenced first.

This is the more expensive path in raw effort and it carries the highest schedule risk. R8 and R9 are
its risks, and the phase exit criteria are their mitigation.

### 21.4 The precondition

Before committing beyond Phase 1: **demonstrate the no-audit property on a toy world in the first
fortnight** (§14.1). Three parties, one asset, one bond, one secured loan with a rehypothecation hop.
Show that value cannot leak because no verb leaks it; that over-pledging cannot be written; that
creation and destruction are readable balances on named accounts.

If that works, the rest is engineering and this document is a plan.

If it does not — if the ledger needs an escape hatch on day one, if the write door must be opened for
something ordinary, if conservation turns out to need a tolerance — then the central claim has failed
and the plan must be revised before the model is built on top of it. That is what Phase 1's kill
criterion is for, and it is why the substrate is proved before a single economic system exists.

---

## Appendix A — Failure modes this design is hardened against

Recurring structural failures in large simulation systems, and the section that addresses each. They
are listed as a review aid: when something goes wrong, it is usually one of these wearing a costume.

| # | Failure mode | Addressed by |
|---|---|---|
| 1 | One fact in two representations, with nothing forcing agreement. | §5.1, §5.4 |
| 2 | A derived view stored beside its source and read as current. | §5.4, §10.3 |
| 3 | Identity as a plain string, so a wrong key returns a plausible default. | §5.2 |
| 4 | Quantity and value sharing a numeric type — equal exactly while price is par, which is when getting it wrong is free. | §5.3 |
| 5 | A bound standing in for a missing mechanism, which then hides the absence it covers. | §15.1 |
| 6 | Value moved by assigning a field; a write is indistinguishable from a transfer. | §6.1 |
| 7 | A residual used as a holder — always balances, so it can never report that the sum is wrong. | §6.2 |
| 8 | Verification that cannot fail: both sides from one source; a check in a language that cannot see its subject; a comparison against an undefined value. | §6.6, §14 |
| 9 | Declared vocabulary no writer ever produces, so the type describes a richer world than the code. | §14.2, tier 2 |
| 10 | State rebuilt from a fixed field list, silently dropping whatever was added later. | §5.1 |
| 11 | The same read written in many places, drifting apart; the dangerous copy is the one missing one clause. | §4.3, §7.3 |
| 12 | Positional coupling across a boundary, with names living only in comments. | §12.3 |
| 13 | Per-period work proportional to accumulated stock rather than to activity. | §7.3, N3 |
| 14 | Two acceleration strategies against one seam, so neither can be enabled. | §12.3 |

---

## Appendix B — Glossary

| Term | Meaning here |
|---|---|
| **Agent** | An entity that makes decisions: a firm, bank, fund, insurer, household, government. |
| **Asset** | Anything that can be held in a quantity: currency, security, physical good, capital, dwelling. |
| **Counter-account** | A named account representing a source or sink, so creation and destruction are transfers. |
| **Conserved** | A quantity whose total across all holders cannot change except by moving it. |
| **Encumbrance / lien** | A claim by one party over units held by another, without transfer of holding. |
| **Instrument** | A specific issued thing that can be held and priced, with declared facts and obligations. |
| **Instrument facts** | The closed set of questions every instrument type must answer (§7.2). |
| **Manifest** | A system's declaration of what it reads and writes, from which its access handles are minted. |
| **Obligation** | A scheduled future payment or delivery arising from an instrument, stored as a row. |
| **Period** | One discrete step of the simulation. |
| **Placeholder** | A registered constant standing in for a mechanism not yet built (§15.1). |
| **Reservation level** | The price at which a participant is willing to transact, and the size it scales into. |
| **System** | A module doing one part of a period's work, over declared reads and writes. |
| **Verb** | One of the closed set of ledger operations; the only way state changes. |
