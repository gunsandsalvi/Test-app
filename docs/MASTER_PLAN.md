# MASTER PLAN — Single Source of Truth

The only planning document in this repository. **§1** the standing rules, **§2** the codebase map,
**§3** what is real and what is not, **§4** the work order, **§5** instructions for the OPEN items,
**§6** defects and watchlist, **§7** the record (never renumbered).

**How to work:** take the next unfinished §4 item, read its §5 section, build it, run the §1.10
ladder, commit it as one bounded change naming the item. Never start an item whose prerequisites
are not done. **When an item closes:** its §4 row says so in one line, its §5 section is DELETED,
and the record goes in §7.

**This file was compressed 2026-08-31 under rule 11** (4,387 → under 1,000 lines). Every §7
record keeps its NUMBER and its finding/number/lesson in one line; the uncompressed narrative for
every record lives in git history immediately before the compression commit. Code comments cite
§7.N — the numbering is load-bearing and never changes.

---

## 1. Rules of engagement

Standing user directives. Not suggestions.

1. **Every asset price is the result of real supply/demand clearing.** OAS, discount margin,
   yield, P/E are *statistics derived from a cleared price*, never the mechanism that sets it.
   One exception: central-bank **administered** rates (SRF / ON RRP), where a posted rate with a
   real quantity response is itself the real-world mechanism.

2. **No caps, floors, ceilings or rescales** except genuinely mathematical ones (a price cannot be
   negative; finiteness). If a number explodes, the mechanism that should compensate is broken:
   find it and fix it at the root. Never clamp the symptom.

3. **"1$ is 1$":** every dollar traces to a named counterparty. The recurring anti-pattern to hunt
   and kill is **two disconnected representations of one real thing** — a real cleared ledger and
   a parallel formula that overwrites or ignores it.

4. **No real-world data, and no real-world OUTCOMES either.** No real tickers, company names,
   observed prices or copied spread tables. A real-world *primitive* is fine (a tax rate, a
   replacement rate, a regulatory ratio, a haircut); a real-world *equilibrium* is not — dollar
   invoicing dominance, a 24% foreign ownership share, a fixed CB market share are RESULTS of
   histories this simulation does not have. Import one and the model can never tell you anything
   about it, because you assumed the answer.

5. **Target allocations are long-term policy guides only.** What a participant buys each week is a
   tactical decision from real characteristics, never the target mechanically.

6. **Long tests are end-of-project only.** During development: `npx tsc --noEmit`,
   `bash scripts/check-hygiene.sh`, `npm test`, and short scratchpad probes.

7. **One bounded, verified commit per slice.** Never one large unreviewable change.

8. **Reflect the real-world mechanism.** When in doubt, the answer is how it actually works, with
   real named counterparties. Ask before large scope decisions.

9. **Periodicity is part of the number.** Every rate, growth figure, flow and index carries a
   period; mixing two silently is one of the most common defects here. **Confirm the period at the
   source and name it in the identifier** (`...WeeklyUSD`, `...Annual`, `...YoY`). A price level is
   part of a number too (§7.149), and so is a unit of meaning: a field named USD is not a share
   (§7.165). Displayed values show MoM and YoY; where history is short, show the level — a missing
   change is information, a fabricated one is a lie.

10. **The simulation is a partial world — do not chase every moved number.** Whole systems are
    still missing, so counts shift for non-economic reasons. Attribute a moved baseline BRIEFLY
    (one cheap A/B at most), record it with its owner, and move on.

11. **Brevity in comments and in this file.** A comment earns its place by saying what the code
    cannot: why a constant has its value, what a non-obvious mechanism is, what was tried and
    failed. Same for this document: every record is the finding, the number and the lesson. No
    information is dropped; the narrative is. **Clean up as you go.**

12. **Do not evaluate market behaviour mid-update.** BUILD THE WHOLE THING before measuring.
    Numbers taken halfway through describe an economy that does not exist yet. **Measure once, at
    the end.** The narrow exceptions are structural: `tsc`/`build`, and a targeted probe that a
    mechanism you JUST wrote is wired. **The harness may be deliberately red mid-project.**

13. **Ownership, prices, quantities and capacities are OUTCOMES.** Never impose a share, a price, a
    flow or a capacity a mechanism should produce. **A residual with no holder is a defect, not a
    boundary** — a named gap is legitimate only with a size, an owner and a scheduled closing
    slice; otherwise it is a plug with paperwork.

14. **Every flow has two sides, and both legs go in the same pass.** A security movement has a cash
    leg; a derivative has a counterparty with finite capacity; a payment leaving one book arrives
    on another. **A one-sided flow is a defect even when nothing fails and every test passes.**
    Building a two-sided flow one side at a time is how a leg goes missing.

15. **A bound is not a price.** All markets clear through the clearing engine: a participant posts
    a reservation, a `fullSizeStatRange`, holding/net-purchase bounds, and the solve clears at the
    **saturation point** if demand cannot absorb the float. Never park a print on a clamp and call
    it a price (§7.21, §7.75, §7.130, §7.132); the subtlest form is a bound that LOOKS like dollars
    and is a percentage wearing dollars' clothes.

16. **Delivery.** One bounded commit per slice, pushed. Commit messages and §7 records state what
    changed, WHY, and the measured numbers, for a reader who was not here. **No model identifiers
    in any committed artifact.** Do not open a PR unless asked.

17. **The targeted-change test.** Adding a product line, a lead time, a revenue rule or a fund type
    must be ONE targeted change: a registry entry, or one profile module. All DATA about what is
    made or who is acting lives in a registry; all BEHAVIOR that varies by kind lives in a profile
    behind a dispatch table. **A stage may not switch on an industry, sector or entity type.**

18. **Model updates come first; a misbehaving NUMBER is not a work item.** The priority is always
    the missing MECHANISM; scoping a project around closing a number is how a model gets tuned
    instead of built. Evidence: §7.146–163 moved the week-10 price print −25.5% → +4.3% with none
    of the changes targeting it. A row whose content is "this number is wrong" is a CONSEQUENCE
    row and its evidence must be re-measured before scoping, never inherited. **The other half
    (§7.179):** when a number is so far out it BLOCKS unrelated mechanism work, closing the gap IS
    mechanism work — find which missing mechanism the number is the accumulated cost of, build that.

19. **THE FEWEST PRIMITIVES THAT GENERATE THE WORLD.** (The most basic rule; 1, 4 and 13 are
    corollaries.) A number is a legitimate primitive **only if no mechanism in the model can produce
    it**: **TECHNOLOGY** (what a process physically takes), **PREFERENCE** (time and risk), and
    **POLICY** (what an institution chooses). Everything else is an OUTCOME, and a stated value for
    it is a defect with a scheduled death.
    - **RESOLUTION** parameters (strata count, grid size) are numerical choices; the test is
      INVARIANCE. **SHAPE** parameters (a Pareto alpha, tier shares, an MPC ladder) are claims
      about THE ANSWER. **TRUE** primitives are the three kinds above, and there should be few.
    - The count of stated shape parameters measures how much mechanism is missing. Keep it falling
      (§5-DIST-P holds the scoreboard). Where an aggregate sits far from a threshold its own
      mechanism turns on, that mechanism is SWITCHED OFF and a constant is standing in for it.
    - **The corollary that costs most:** a shape parameter STANDS IN FOR a missing mechanism —
      deleting it before the mechanism exists makes the model wrong, not more bottom-up (§7.158,
      §7.177). The order is forced.

1.20 **NEVER ROLL BACK.** When a change makes a print worse, the answer is never to put the old
    number back. A derivation that replaced an invented constant does not become wrong because the
    world it now describes is uglier — the ugliness was there, and the constant was covering it
    (§7.209 named this rule). **A bad print is a finding, not a regression.** The only thing that
    may be undone is a change WRONG on its own terms — a ratchet, a resolution artefact, a broken
    identity — and that is a fix, not a rollback. This binds hardest at the end of a project, when
    one number is embarrassing and the old constant is one line away.

### 1.10 Verification ladder

| Command | Cost | When |
|---|---|---|
| `npx tsc --noEmit`, `npm run build` | seconds | any time, always before a commit |
| `npm run lint`, `npm test` | seconds | any time; both gate CI, both ratchets |
| `bash scripts/check-hygiene.sh` | seconds | any time; fails if a second script appears |
| `WEEKS=10 SHOCKS=0 npx tsx scripts/harness.ts` | ~40 s | structural probe: is the mechanism wired |
| `WEEKS=60 SHOCKS=1` (npm run verify: 243 wk + batteries) | minutes | **END OF PROJECT ONLY** (rule 12) |

`NODE_OPTIONS=--max-semi-space-size=64` is worth 7.5% (allocation-bound, §7.213); wired into
`npm run verify`/`npm run profile`. `UNIVERSE_SCALE<1` is iteration speed ONLY — the rule-19
invariance test FAILS on the current world (§7.228). A 10-week probe samples ONE SEASON (IND18);
price behaviour is judged on whole years.

---
## 2. Codebase map

### 2.1 The weekly pipeline (`src/engine/simulation/`)

`core.ts` builds a `WeeklyStepContext` (`stages/context.ts` — one shared mutable context) and runs
~50 stages in order:

| Group | Stages | Owns |
|---|---|---|
| Macro & credit | 01-macro-feedback, 02-region-macro, 02b-bank-diversification, labor-market, prime-brokerage | Contagion; region evolution and the administered policy rate (no curve); per-bank flow ledgers, GC repo, deposit-vs-MMF split; labour; broker lines |
| Real economy | 03-category-demand, 04-input-output, trade-settlement, goods-arrival, sourcing-intent, freight-clearing, 05-unit-bidding, 06-fx-and-trade, 07-commodities | C+G plus the Leontief intermediate half (§7.272); input clearing; invoices; arrivals; sourcing/freight; **THE goods auction** (five books per sub-unit, per-lot settlement, contracts, capex bids, distribution channel); FX conversion; commodity spot |
| Financial books | 07b corp bonds, 07c sovereigns (curve's only owner), 07d loans, 07f bills+CP, securities-lending, 07e equity, 07g swaps, 07h CDS, 07i futures | Each a thin adapter over the clearing engine |
| Settle & report | repo-collateral-reconcile, holdings-writeback, institutional-marking, 08-company-fundamentals, hc-lifecycle, settlement, sme-pools, 09-concentration-risk, 10-mergers, sovereign-calendar, 11-fiscal, etf-flows, fx-hedging, 12-portfolio, 13-news | Per-company week (order-invariant sharded kernel, entity-scoped RNG §7.223; rules in `domain/company-week/` §7.238); lifecycle; **settlement (intraday + close cycles; comp.cash has ONE mover — settlement, §7.263)**; SME pools; M&A; the sovereign coupon calendar (§7.208, one party-keyed ledger); measured GDP/CPI, issuance; ETF flows and the share book; FX hedging; marks |

**`stages/financial-clearing-engine.ts`** — the generic cap-free double auction: real demand
schedules, exact piecewise-linear segment walk, **saturation clearing**; `statKind` orients it;
flat typed arrays, worker-shardable byte-identically. Every asset class is a thin adapter owning
participants, reservations, sizes and the float. `unsoldStaysWithHolder` rations BOTH sides (stock
books); flow books keep a dealer residual (real outside order). Read §7.16 and §7.21 first.

Other engine files: `initialization.ts` (must seed the shape the engine produces — §7.4),
`shared-helpers.ts`, `equity-valuation.ts` (the ONE answer to what a share is worth), `credit.ts`,
`merger.ts`, `trade.ts`, `constants.ts`.

### 2.2 Engine support (`src/engine/`)

`companyGenerator.ts`, `pricing.ts` (display/derivation only), `nelsonSiegel.ts`, `blackScholes.ts`,
`rng.ts` (all draws; seed+position on GameState; `beginEntityScope` keys a draw to its entity —
§7.223), `newsGenerator.ts`, `formatters.ts` (`formatPercent` requires `isDecimal`), `macro/`,
`bootstrap/` (all generated from primitives; seed investment fixed point §7.199).

**`ledger/` — the money primitive (§7.230, §7.242, §7.275–276).** `post(payer, payee, amountUSD,
reason)` is the one write path; `creditUnbacked()` the named counted exception; `pay()` throws on
NaN/negative; `bookPnL(bank, amount, reason)` is the one bank-P&L write (PNL_TRACE=1);
`payment-category.ts` classifies every reason at intern time (unclassified = harness violation).
`check-hygiene.sh` fails the build on a money-field write outside the ledger, both forms.
Also in `simulation/`: `stage-deps.ts` (STAGE_TRACE=1 records context reads/writes;
`DELIBERATE_PIPELINE_FIELDS` annotates every deliberate backward edge, remainder ratchets at ZERO
— §7.278), `burn-in.ts` (SEED_BURN_IN=n, off — §7.232), `bank-identity-trace.ts`
(BANK_IDENTITY_TRACE=1, the per-stage identity residual instrument — §7.252, §7.259).

### 2.3 Domain (`src/domain/`)

The registry is the single data owner (rule 17): `industry-registry.ts` (sub-unit specs — physics,
buyer mix, recipe BOM, seasonality, financing, consumption intensity) with derived views.
Instruments/books: banking, company, institutions, primary-market, call-protection, repo, swaps,
credit-default-swap, securities-lending, commodity-futures, commercial-paper, prime-brokerage,
dealer-desk, dealer-derivatives, etf, indexes, distribution, volatility. Trade/FX: global-goods,
trade-invoice, invoice-currency, cross-border, fx-market, fx-hedging, currency, carrier.
Households/state: region-macro, household-credit, estate, government, central-bank, geography,
game-state, defect (GUARD's loud failures).
STRUCT objects: `company-week/` (seven pure flat-input rule objects, 72 tests, §7.238 —
capital-programme carries §7.288's derived growth-funding cap), `assets/` (four-taxonomy
reconciliation), `government-entity.ts` (the one budget decomposition; the stance reads it
§7.280), `collateral.ts` (one pledge tolerance), `fund.ts`, `sme-pool.ts`, `sovereign-id.ts`
(the ONE GOV id format; `isBillBucketKey`), `institution-profiles.ts` (entityType facts registry;
`mandatePctOf`), `units.ts` (branded number families, applied seam by seam), `bank-book.ts`
(BankingSectorView readonly typing — §7.279).

### 2.4 UI and the harness

UI reads `GameState` only. **One harness:** `scripts/harness.ts` via `npm run verify` — every
check, battery, profiler as modules on one pass. Checks: NaN purity, ownership/holdings
conservation, per-bank identity, CCP and unresolved residuals, **declared boundary frontiers**
(ONE line remains: 'wholesale funding repaid', seed-gated §7.286 — anything else fails the week
it appears), NAV identity, damper binding (decomposed by book, §7.288), bank capital/NIM bands
(all regions), unemployment bands, shock batteries. Instruments (env-gated): FP=1 fingerprint,
STAGE_TRACE, BANK_IDENTITY_TRACE, NIM_TRACE, BANKCAP, DESK_TRACE, BOOKTRACE, SPIRAL/
SPIRAL_PRICES/PX_FOCUS, SEED_RECON, CARRIER/FREIGHT_TRACE, OD_TRACE, PNL_TRACE, BYPASS_TRACE,
RECON_TRACE, CAPEX_TRACE, BOUNDARY_TRACE, LEFTOVER_TRACE, EQ_CONS_TRACE, HH_EQ_TRACE.

**One TEST TREE:** `test/` holds PURE-FUNCTION tests over `domain/` only (no engine run) —
72 tests; hygiene enforces the boundary. **The gates, every one a ratchet (may fall, never
rise):** lint = `tsc --noEmit` (strict) + ESLint on this repo's paid-for defect classes
(ceiling 386); hygiene budgets: assignment-form money writes 3, spread-form 16, asset-literal
comparisons 58, test purity. CI runs lint+hygiene+tests on push/PR; the harness is deliberately
NOT in CI (red mid-project by design).

---

## 3. Current state

**Bottom-up today.** Category demand (C+G + Leontief intermediate) → input-output → stage 05's
auctions with named counterparties, per-lot provenance, settled sales AS revenue, capex as real
bids capped by real financing (§7.288), a distribution channel priced off physics. Commodities
from extraction cost. Every financial book clears on one engine, with the primary market and
named bank desks as ordinary participants. Per-bank balance sheets, real CB facilities, itemized
lending with endogenous money, real issuance, remittance loop, measured CPI, single-owner curve,
OIS on the cleared repo print. Private lifecycle (LP capital, marks at the public multiple).
Households at corporate depth: cohorts, real ageing, cross-sections where decisions are
nonlinear, a labour market summing real employers. SME pools per (region × industry). One
settlement layer with two cycles; **deposits evolve by settlement alone** (the 02b reconcile
deleted at a measured zero — §7.288). Default resolution with real estates (assets sold to named
peers, real invoice receivables — §7.286). The UNMODELED boundary is silent at 60 weeks (§7.287).

**Still formula-driven, each with an owner:** the insurer's claims loss ratio and the card
operating cost (IND-R4, gated on missing mechanisms); the corporate tax BASE (TAXR).

**Real but structurally undersupplied.** Honest auctions on an asset universe that does not match
the money pointed at it — half the damper count is the small-cap equity tail (§7.288). SCALE grows
the universe; a correct auction over a short float still gives a wrong price.

---
## 4. The work order

The only place a project's order and state live. Work top to bottom; never start an item whose
prerequisites are not done. Do not reorder.

**THE RUN TO JUDGE AGAINST IS §7.293's: 15 violations / 8 FAMILIES on the §7.291 tree** (u
endpoint 31.1/28.4/25.4/22.7; capex/depreciation 0.90/1.00/0.90/0.91 with EUR at replacement;
meter 0.1B; boundary −0.0B; the §7.289 chain continues 30 → 15). SEED_BURN_IN evaluated and
REJECTED on measurement (§7.294: the burnt world prints 99 — the gate stands closed). Previous:
**§7.289's 30 / 7 on the §7.288 tree** (counts 628 → 361 → 351 → 320 → 367 → 278 → 204 → 169 → 99 →
52 → 13 → 30; the rise from §7.287's 13 is the §7.288 relabel plus two regrown watch families —
read §7.289 before comparing). Headlines: the u endpoint BENT (30.3/28.1/25.4/23.2 vs 33.6/28.9/
26.3/26.3 — USA grazes the 30% band only in the last four weeks), capex/depreciation 0.90/0.88/
0.88/1.00 (EUR normalized from the 7.5x blowup; JPN at replacement), meter 0.1B watchdog-quiet,
boundary one declared line at −0.2B, CPI ×2.189. Compare nothing across trees without naming the
relabels between.

**STANDING DIRECTIVE (user, 2026-08-31):** finish the entire pipeline through S-final without
stopping — STRUCT, the §4.0 queue, Tier-5, the gated decisions (seed rebases explicitly
permitted, including SEED_BURN_IN, judged against the current reference per their gates), then
the build table MNC → DYN → PROD → CRE → TAXR → SCALE Wave 2 → S-final. Stop BEFORE AU (the UI).
Decide from the rules; push every commit to `claude/master-plan-file-pv33a9` AND `main`.

### 4.0 The fix order (post-§7.289)

1. **UK bank NIM (16x, the top family)**: survivors marginal-to-negative (−0.012…0.0096 against
   the 0.01 floor) — §7.254's machinery (NIM_TRACE) points at it; the sovereign-book accretion
   missing from the income measure (§7.254's named remainder) is the first suspect, VOUL's seed
   wholesale the second.
2. **The leveraged-loan/sovereign mint drift (2.0–2.3% over, 6x)**: §7.259's known remainder —
   claims on issuers that left the book entirely are not swept by the paydown. Sweep them.
3. **The damper, worked by named class**: 2,481 persistent binds at 60wk — equity 774 (small-cap
   tail, owner SCALE), corp bond 617, stock loan 472, CP 413. The 10Y-pinned question rides here.
4. **USA u at the band edge** (30.1–30.7 in the last four weeks): the capex cap bent the path;
   what remains is the LAB long-horizon row at the harness boundary, not a spiral.
5. **Tier-5 measurement debt** (below), collectable from the ref60b log.
6. **Standing gated decisions** (each on its own recorded gate): SEED_BURN_IN stays OFF until
   §7.232's table flattens; the seed wholesale-claim re-anchor and COH's `equity: 0.42` behind it
   (§7.283, §7.286); manager/vehicle split step 1 (`managesEntityIds` — design in §7.284).
7. **Tier-6 — the build table** (prereqs closed; MNC first).

### What is left to BUILD

| # | Project | State |
|---|---|---|
| 1 | **MNC — multinational production** | BUILT (§7.295). Armed and inert until counters cross the §7.138 year; first live read is the next long reference. |
| 2 | **DYN — entry, exit, industry structure** | BUILT (§7.296). Entry×margin, mothball/restart/scrap, vertical integration; the stock clocks (13/52wk) arm at horizon. |
| 3 | **PROD — firm productivity and innovation** | BUILT (§7.297). Wright's law per firm; stated drift dead. R&D spend / product innovation deferred with reasons. |
| 4 | **CRE — commercial property and leases** | BUILT; MARKET GATED (§7.301). The live market is a measured §7.245-family spiral at the seed's level; landlords/entry stand. Reopens with the §6.1 level-row decision (`CRE_MARKET_LIVE=1` re-measures). |
| 5 | **TAXR — corporate tax, really** | BUILT (§7.299). Acceleration, carryforwards, deferred view, regional rates; transfer pricing deferred until intra-firm flows emerge (§7.295). |
| 6 | **SCALE — universe scale-up** | Wall-clock budget met at reduced scale (§7.214); full-fidelity path is Wave 2 columnar state (§5). Owns the damper's float half (small-cap equity tail, §7.288). |
| 7 | **S-final — validation gate** | Everything above plus the measurement debt. |
| 8 | **AU — Aurora, the UI rebuild** | Last. UI state leaves `GameState`. |

### The measurement debt (Tier 5 — finer reads still owed)

Collect from the fresh 60-week reference log, in order:
1. **The equity market's LEVEL** (§7.185's float change moves it by construction) — with the
   damper-by-book equity tail read.
2. **Bank NIM and household interest income** under G3c's deposit rate (a liquid bank whose
   depositors are not leaving pays zero — mechanism's own answer, possibly missing payment
   services).
3. **§5-DER's verify list**: swap spread and CDS-cash basis calm/stressed; contango high-inventory,
   backwardation scarce; expiry convergence; hedged firms feeling less P&L from hedged shocks.
4. **The new books' first prints**: stock borrow clears/fee distribution/recall cascades; ETF
   premium ~0 in calm weeks; channel margin a sensible fraction of shelf price (unbounded above by
   construction — right or a finding).
5. **The logistics scale row's re-measure** (1.0B/wk = 0.05% of world GDP at §7.287 vs real 5–6%;
   owner the freight book, with IND16's channel margin).

### 4.1 Closed projects

One line each; the record is in §7. L (§7.46), HC (§7.33, 41), ETF (§7.44), HH (§7.60), PUB
(§7.68), BP1 (§7.83–84), XB/XB5/XB6 (§7.72–77, 189), SEG (§7.95–97), LAB (§6.4/§7.110),
OWN/OWN7/OWN8 (§7.98, 102, 104, 197), FRM (§7.106), GUARD (§7.105), IDX (§7.134), CASH/SETL
(§7.87–93, 195–197), IND (§7.146–156, 205), CHAIN (§7.117–120), DIST (§7.140–145, 161–175),
DEM (§7.181), CAP (§7.167–168, 176–178), COH (§7.199), HSG (§7.159–160, 183, 200), CRD (§7.162,
184, 201, 205), G3 (§7.185–187), REPO (§7.188), HF (§7.190, 202), DER (§7.191, 201, 203), G5
(§7.192, 202), NAT (§7.193), ETF2 (§7.201, 205–206), IND16/HC3b (§7.205, 207), STRUCT steps
1–6 + enforcement + closure (§7.229–242, 274–279, 290), the Tier-1 bug pass (§7.255), the
zero-boundary burndown (§7.285–286), the money row (§7.288).

Named remainders inside closed rows: **COH** `equity: 0.42` (needs the asset manager anchor;
seed-gated); **IND-R4** two stated cost ratios (gated on loss-event and servicing-cost
mechanisms, §7.283); **G2** the wholesale-roll/holder unification (the last boundary line).

---
## 5. Instructions for the open items

### STRUCT — invariants by construction *(§7.229–242, 274–279, 290 — CLOSED as a project; what
survives is the standing loop)*

Every finite item is done (§7.290): the ledger owns money end to end (§7.288 deleted the
reconcile; the `Account` end-state noun is stated in `engine/ledger/balance.ts`); the four
instrument taxonomies derive from one superset with the registries as the fact-dispatch path
(ratchet 64 → 56); the institution registry carries ten per-kind facts; the labor-demand and
bank-pricing rules joined `domain/` bit-exact with tests. **Deferred, each by its own recorded
rule, to be taken when its gate opens:** the `Money<C>` brand at `pay()` (units.ts's seam rule —
a brand with unbranded producers is theater; the every-call-site window §7.277 named has passed,
so it lands with the columnar payment-journal conversion); the nominal BankBook split (the
readonly view already made the field-poke class uncompilable; a brand buys nothing measured
today); the `details`-bag discriminated union (its 30 consumers are ALL in `src/components` —
AU deletes them, so the union lands with AU's rebuild, not before it).

**The STANDING loop (not a finite item):** when touching a stage that still computes inline
(07f, pe-lifecycle, 11-fiscal, etf-flows are the biggest), extract the rule block first — extract
→ compile → **fingerprint (FP=1, fresh baseline per extraction)** → test → commit; keep every
extracted object flat-input (§7.228). Three of seven kernel extractions failed the fingerprint on
arithmetic reordering alone (§7.238).

### P1 — periodicity and units *(standing sweep)*

The two named renames are done (§7.277). Remainder: walk every rate/flow/index at the source when
touched; the `historicalInflation`/`historicalZeroCurves` one-week lag is documented at the type.
Display: one shared helper, MoM+YoY, period labelled. Aurora inherits it.

### MNC — multinational production *(item 1)*

Every firm is single-region while intra-firm trade is ~a third of real world trade — here zero.
**The design (rule 19 — the fewest primitives): a SUBSIDIARY IS A COMPANY.** The model already
has everything a foreign plant needs — production, labour, books, births, contracts, invoices,
FX — so MNC adds a LINK and a DECISION, never a second production machinery:
1. **The ownership link**: a subsidiary is a real company in region B whose equity the parent
   holds (`parentTicker` + a real register row through the ownership machinery, OWN7-conform).
   Consolidation is a VIEW (parent's earnings + its share of subsidiary earnings), never a
   second set of books.
2. **The FDI decision**: a firm persistently paying more to LAND its exports in region B than a
   local producer's cost (XB3a's landed-cost machinery, measured over the §7.138-style sustained
   window) births a subsidiary there through the existing birth machinery, funded by the
   parent's own cash crossing the FX book as a real payment — the financing decision first, the
   proceeds land, the plant follows (§7.288's discipline).
3. **Intra-firm trade**: supply contracts between parent and subsidiary through the existing
   world contract book — the intra-firm share then EMERGES from who owns whom. The transfer
   price is the contract's struck price (TAXR later makes it a priced choice).
4. **Repatriation**: subsidiary dividends flow to the parent's account through the FX
   conversion path — structural FX exposure the hedging desks' client book then really carries.
**Verify:** FDI responds to landed-cost differentials; an intra-firm trade share EMERGES; one FX
move changes a multinational's consolidated earnings through both channels.

### DYN — entry, exit, industry structure *(item 2)*

Concentration as an outcome. **Entry:** sustained high category margins attract entrants through
HC's birth machinery — entry is DIST's reinjection at the absorbing barrier, do not build it
twice. **Exit:** sustained losses idle capacity (mothballed, restartable) then scrap it — the
missing half of every capacity cycle. **Structure as strategy:** a firm repeatedly burned by
contract breaks (IND11's measured record) integrates upstream; IND7's antitrust is the regulator.
**Folded:** `NAMED_TIER_REVENUE_SHARE = 0.6` states a cut point the Pareto tail already decides —
the naming threshold becomes a property OF the distribution.
**Verify:** category margins mean-revert through entry/exit; capacity leaves in downturns and its
absence is visible in supply; integration follows measured failure.

### PROD — firm productivity and innovation *(item 3)*

`rndExpense` buys nothing today. R&D becomes a real investment with uncertain outcomes — process
(unit cost falls) or product (a new line through the registry) — and diffusion erodes any lead
(rule 4: temporary advantage, never permanent monopoly). Firm-level dispersion plus reallocation
through IND6's price competition is the growth engine.
**Verify:** R&D intensity predicts outcomes noisily; aggregate growth decomposes into within-firm
and reallocation terms; cutting all R&D flattens growth over years.

### CRE — commercial property and leases *(item 4)*

Space as a produced long-lived asset (the construction sector builds it), owned by landlords,
rented on multi-year leases that are real tenant liabilities, financed by CRE loans on named
banks' books — the classic systemic channel (vacancy → landlord default → bank capital).
**Verify:** rents clear on vacancy; lease obligations on tenant books; a CRE bust marks bank
capital through named loans.

### TAXR — corporate tax, really *(item 5)*

Tax depreciation schedules against book (the investment incentive), loss carryforwards (receipts
fall FASTER than profits in downturns; a recovering firm pays nothing for years), and — after
MNC — profit booked where rates are lower.
**Verify:** receipts more cyclical than profits; carryforwards revive and expire; investment
timing responds to depreciation treatment.

### SCALE — universe scale-up *(item 6)*

**THE TARGET IS 100 ms/WEEK — set by the user (2026-09-01), superseding §7.222's "~370–490 ms
honest target" note.** That note was an argument about the CURRENT architecture (stage 05's
shared-wallet serialization), not a bound: reaching 100 ms requires the full wave — phase 3
companies-as-columns, phase 5 workers, the long tail converted — AND a mechanism redesign of
stage 05's market sequencing (per-market budget envelopes or equivalent), which is a DECLARED
RELABEL judged by reference like any other. Current measured: 1,583 ms/wk (§7.300); stage 05
477, stage 08 409, ~40-stage tail ~700, GC ~8%.

**THE 100ms CAMPAIGN (task #12) — the plan of record, measured gates at every step.**
W0 (measured, dead end): the existing clearing-worker pool parallelizes only the packed kernel
(~21 ms/wk); the 07x stages' cost is the OBJECT CEREMONY around it — pack/build/apply. So the
campaign's law: kill ceremony with columnar state end-to-end, shard the two big BODIES, and the
object graph becomes a VIEW at the boundary, not the store. B1 world tables (companies/tranches/
holdings/journal exist; contracts, invoices, relationships, regions to add) → B2 stage 08 rebuilt
as a numeric kernel over columns (worker pool, §7.222's entity-scoped RNG already makes it
order-invariant) + a main-thread effect applier (32 ledger posts, 89 scalar writes, 29
tranche/line touches per firm-week — censused by Proxy audit) → B3 stage 05 rebuilt: per-market
budget ENVELOPES (declared relabel — pre-split each buyer's cash by need shares so markets shard;
markets already open their own RNG scopes) + market kernels on the pool → B4 the ~700 ms tail
batch-converted → B5 objects demoted to views. Validation: SHARDS=1≡n, FP for pure steps,
references for the envelope relabel. 4 cores: 100 ms needs ~4-5× serial × ~3.5× workers — the
serial factor comes from B1/B5, the parallel from B2/B3/B4.

**Measurement-gated; profile first, always.** Two hard constraints: determinism is sacred
(same-seed A/B byte-identical), and no economic shortcut dressed as an optimisation. Owns the
damper's float half — and the small-cap equity tail that is HALF the §7.288 damper count. DIST
challenges the premise: depth in a book may be partly a RESOLUTION problem.

**Wave 2 (columnar state) — diagnosis:** the economics is ~70 ms; the rest is a graph of ~150k
heterogeneous objects walked by pointer, allocating as it goes (§7.212–222). The design: structure
of arrays (an entity is an int32 row); strings die at the boundary (interning); relationships as
CSR; arenas, not allocation; payments as a columnar journal; a stage is a kernel over a range;
determinism by construction (row order, shard-order combines — the clearing engine is the proof
pattern). Milestones 1–3 done (§7.217: party ids, CSR register, columnar journal); phases:
0 whole-state hash gate → 1 primitives (Table/intern/arena — built, §7.218) → 2 holdings →
3 companies (the one that pays: stage 08's 78 µs/company floor) → 4 workers (only after 2–3;
§7.222: stage 08 is shardable only under the entity-scoped RNG relabel; stage 05 is serial by
construction — firms share a wallet across sequentially-opened markets, so 100 ms on four cores
is out of reach and ~370–490 ms is the honest target) → 5 the rest. **If a step cannot be
bit-exact, stop and declare the relabel.**

### S-final — the validation gate *(item 7)*

Full `npm run verify` green plus the §4 measurement debt read in order.

### AU — Aurora, the UI rebuild *(item 8)*

Delete and rebuild `src/components/` + `App.tsx`. Required process: written design brief → mockups
→ build; real-world product inspiration. Folded: UI state leaves `GameState` (the determinism hash
spans it). Inherits §7.240's UI-rot inventory (every fix is "read the stored value").

### DIST-P — the primitive scoreboard *(the rule is §1.19)*

The household cross-section needs TWO permanent primitives — PATIENCE and RISK AVERSION — plus one
temporary illiquidity friction; firms need zero to one. **The count stands at ~41 stated numbers
and may never rise.** This model generates its own idiosyncratic income risk (a household is
unemployed because a real firm laid it off), which is the largest saving and already banked.
Open blocks: `TIER_OCCUPATION_MIXES` (dies with the occupation mix as an outcome of who firms
hire), `PARETO_ALPHA`/`NAMED_TIER_REVENUE_SHARE` (die with DYN), `WEALTH_SPENDDOWN_YEARS` (dies
when housing wealth is fully spendable).

---
## 6. Defects and watchlist

### 6.1 Live defects

| Defect | State and next action |
|---|---|
| **THE UNEMPLOYMENT RATCHET'S CAPEX CHANNEL** | **THE ENDPOINT BENDS (§7.301): USA u 30.6 at w30 → 26.9 at w60, falling through the back half** on the fixed full-pipeline tree — the first bend-down at horizon in the model's history (capex cap §7.288 + the §7.301 fixes: level target de-learned, fiscal seed re-struck, CRE market gated). Remaining: 7 transient crossings of the 30 band in the mid-run hump, and JPN still rising (30.1 at w60 — the next regional read). §7.272's want-vs-budget wedge still owed. Owner: CAP/LAB with each reference. |
| **THE BOOKS PRINT THEIR DAMPERS** | 1,640 persistent binds at §7.287 (worst streak 60wk); 10Y pinned ~4.77 most trees (released twice, §7.256/§7.261 — reproduces, then re-pins on relabel). **§7.288 decomposed by book: equity 771 (the small-cap tail, §7.31 — owner SCALE), stock loan 283, corp bond 229, CP 83, lev loan 77; sovereign = 2 bills.** Burn down by named class, not as a scalar. Do not widen the damper (§7.197: the pressure was always there). The w52+ seam remainder rides here: the YoY base effect still reaches the world through wage indexation (§7.249–250). |
| **BEHAVIOUR LIVES IN THE STAGES, NOT THE OBJECTS** | §7.229: 7,736 lines domain/ vs 24,595 stages/. Partly closed (four defect objects §7.230; company kernel §7.238). Next: continue the extract→fingerprint loop stage by stage. Owner: STRUCT step 2. |
| **A SECURITY IS A DISPLAY STRUCT** | `TradeableInstrument` = tag + 26-optional-field bag; four taxonomies reconciled additively (§7.230) but the discriminated-union migration is open; a new profile still has no small-firm tier (SME pools keyed by industry). Owner: STRUCT step 4. |
| **EVERY MONEY FIELD IS NAMED USD AND HOLDS LOCAL MONEY** | `PaymentInstruction` carries no currency; §7.255 fixed the named salads (GDP NX, carrier revenue, commodity ratio) but the cross-book instruction legs remain. Next: brand `Money<C>` at the `pay()` seam. Owner: XB/STRUCT Tier 4. |
| **ONE QUANTITY, MANY AUTHORS — remainder** | §7.255 killed the tax rate, recovery basis, ERP, carrier ladder. Still open: THREE PD models in stage 05, three depreciations in 08, two labour-force computations, two consumer loss curves in one function. One owner each, grep for the number after (FRM discipline). |
| **THE SEED'S LEVEL (~86% uniform undersupply)** | §7.255/§7.272 sharpened: capacity seeds at first use; units-coverage ≡ the demand-vs-revenue value ratio; stage 03's double-count fixed (§7.272); what remains is Σ firm revenue < solved gross output (the step-6 sizing gap) and the want-vs-budget wedge reading. A level decision on the demand derivation. Owner: the seed, with IND. |
| **THE REGISTER OPENS AT A QUARTER OF ITS STEADY STATE** | §7.232: rows 32,278 → ~113k settled (×3.51); one line of step 6's table. The claimed algorithmic win is dead (§7.228: 0.0% duplicates). Owner: seed via SEED_BURN_IN gate. |
| **A SHOCK TEST STOPPED MOVING ITS PRICE** | Sustained-equity-demand A/B pins at the damper (same signature as the sovereign one). Re-measure with the damper work. |
| **INSTITUTIONAL OPENING SIZE STILL ASSIGNED** | `INSTITUTIONAL_OPENING_BOOK_SHARE.equity = 0.42` — needs the asset manager anchored on households' own fund holdings; interlocks with the manager/vehicle split; a full seed re-base (SEED_BURN_IN gate, §7.283). Owner: COH. |
| **A MANAGER AND A VEHICLE IN ONE OBJECT** | HEDGE_FUND/PENSION_FUND are both; neither is modelled. **Design assigned (§7.284, ETF template):** (1) vehicle keeps the InstitutionalEntity (assets, cash, unit-holder liability; HF gets an LP register — DYN-adjacent); (2) manager keeps the Company shell with a NEW `managesEntityIds` link replacing id-equality (first commit, pure structure); (3) the fee becomes the real vehicle→manager payment (§7.285 executed this on the conflated object). Own §1.7 chain. |
| **FX SWAP LINES DO NOT EXIST** | The routine stress instrument; needs an FX funding market first (its own stated gate, §7.282). |
| **§7.302 BANK RESOLUTION — WIP, one open defect** | Built (PCA trigger 2% RWA, single-assuming P&A, wholesale haircut, reserves as a flow); UK NIM 27x→1x. OPEN: ~51.7B one-week identity residual on the assuming bank at the resolution week; the funding split then derives wholesale to −40.6B persistent — a deposit class double-moves. Resume via THSY/GCKB per-line diffs (BANK_ID_TRACE) + applyBankFundingSplit's wholesale derivation (floor it at 0). PARKED: SCALE is the sole priority (user, 2026-09-01). |
| **FX SPREAD — remainder** | §7.282 charges the corporate trade-invoice leg (2bps to the buyer's home banks); aggregate buyers (household/government) and the financial books' own conversions still cross at mid — extend the same leg when those flows carry a named payer. |
| **LOGISTICS IS AN ORDER OF MAGNITUDE TOO SMALL** | 1.0B/wk = 0.05% of world GDP at §7.287 vs real 5–6%; carriers all alive and earning (§7.267) so the gap is domestic tonnage/scale, not deaths. Measurement-gated re-read (Tier 5), owner the freight book with IND16's channel margin. |
| **UK/EUR BANK WATCHES** | UK NIM marginal (survivors 0.0089–0.0098 vs the 0.01 floor — VOUL's seed wholesale at its cleared spread, §7.259/§7.261: watch, not defect); EUR banks carry wholesale they cannot repay, EUR band pending (§7.254); sovereign-book accretion missing from the NIM measure — pass prior-week accretion in when the family next surfaces. |
| **THE LAST BOUNDARY LINE** | 'wholesale funding repaid' — the seed created the funding stock with no holder asset; the true close is seeding the matching claim (SEED_BURN_IN gate). Bank-issuer paper drift stays on holders' books until G2 unifies the roll with its modeled holders (§7.286, §7.288). |
| **CONSEQUENCE ROWS (rule 18)** | Equity prices past ~w80 and real-growth escapes at horizon: evidence, void as scoped; re-measure on the current reference before deciding a mechanism is missing. |

### 6.2 Watchlist — measure, do not fix

| Metric | Why |
|---|---|
| `unbackedBankCashUSD` | ~1,450B at w60 and rising across references — the named-gaps scoreboard; `creditUnbacked()` counts its own contributions by reason. |
| `unmodeledFinancialAssetsUSD`, `governmentInterestToUnmodeledHoldersUSD`, `unmodeledCapitalReceiptShareOfIncome` | What the model contains but does not attribute; each only shrinks as channels become real. |
| The TGA over a quarter | Sawtooths on remittance dates — watch the LEVEL, not the shape. |
| Occupational mismatch | Produced by sector composition moving faster than retraining. |
| Sovereign price elasticity to a size-only bidder | The books ARE thin (consistent with the damper row). |
| Household income top-down vs bottom-up | `estimatedHouseholdIncomeUSD` remains the top-down anchor. |
| The named private tier still sells nothing | ~300 seeded private firms/region carry `productLines: []`. |
| Loan-book Spearman noise | 0.26–0.76 at 23–32 names; re-measure as the universe grows. |
| The two credit-ETF w3 dust singles | 0.01B, baseline since §7.275; likely in-kind slice edge or pending-settlement timing at the bound (§7.262). |

### 6.3 The clamp discipline

**A clamp is almost always covering for a decision that is not being taken.** Delete it only once
the decision is real (§7.167), and never delete a stand-in before the mechanism it stands in for
exists (§7.158, §7.177). The programme is closed (§7.176); the rule survives.

---
## 7. Record and lessons (do not re-learn)

Referenced from §5/§6 and from code comments — **never renumber.** One line per record: the
finding, the number, the lesson. Full narratives in git before the 2026-08-31 compression commit.

1. "1$ is 1$" at rest on the goods side: real auctions, pro-rata clearing, per-lot FIFO provenance, capex as real bids.
2. Sovereign demand signals mean-revert; an invented fair-yield level or trend-following runs away — a sovereign yield move is a valuation event.
3. Targets are relative weights on real pools (`pct × totalAssets` summed to 2.8x the market). Amended §7.18: a large renormalisation factor is information — read it, don't divide it out.
4. **Seed shape must equal engine shape** — a cold start in another shape is a fake week-1 shock; the most repeated defect here (§7.10, 21, 31, 49, 55, 58). Strictest form: seed by calling the engine's own code.
5. Shared-field collisions (two writers, one field) caused four mass-collapse bugs; when a value is per-X, key it by X.
6. Cash-constrained bidders ration quantity, not price — underpricing under pro-rata clearing is a permanent shut-out spiral.
7. Rating agencies lag, spreads don't — keep the fallen-angel forced re-rate.
8. Wall Street phases 1–2: per-bank sheets, SRF/ON RRP, corp/sov/loan clearing, generic engine extraction.
9. S1 — income/GDP identity: unnormalised tier premiums made household income 106.6% of GDP; normalise by the BASELINE mix; transfers are not purchases (only procurement is G); `bootstrap/national-accounts.ts` owns the identity.
10. S2 — the curve has one owner (07c). A tilt alone cannot anchor a level (2Y sank 349bp below policy); the bonds-vs-cash choice sits OUTSIDE the strategic drift. Empty per-tenor books and phantom matured tranches each cost a run.
11. G1 — inflation is measured (real basket, chain-linked); the AR(1)/wage-push/money terms are dead. Stage 03's weekly rebuild dropped `unitPriceUSD` and every price rebased to ~$1: a stage writes the fields it owns and nothing else.
12. S3 — three structural bugs found by tracing a number to its source (first-rung covenant test, holdings > float by w24, the "accretive call" that was deleveraging). **A market cannot be signed off by watching its price — watch FLOAT and HOLDINGS first.**
13. S4 — money moves with the securities; dealer revenue is what clients actually paid; cash+securities move only by real flows (worst week 0.47%).
14. RV demand — allocation responds to price via excess spread over capital charge; apply the tilt to the STRUCTURAL target, never current holdings (feedback ratchet 78→1388bp).
15. RV supply — the float responds to its own price (float 77→104B into tight spreads, then delevers). **A price that will not stay put usually means one side of its market is missing.**
16. E1 — the engine prices a demand schedule; Spearman(OAS, ownership) −0.731 → ~0. **A number directionally right is good enough to nudge a quantity and not good enough to be a price.** (The recovery-derived ceiling was retired — §7.20.)
17. The phantom leveraged-loan market: 167 of 200 quotes never cleared, frozen at generation. **When a market's statistics look random, check how many instruments are actually IN it.**
18. The money and the assets were never reconciled: corporate credit 6.4x short — the hidden corporate sector. When a probe prints a round 0 for something large, verify the field name.
19. Post-E1 review: sound as built; refinements later closed (§7.20, 21, 52).
20. E2 — structural PD (distance to the ACTUAL trigger: coverage AND cash), distressed recovery as a second REGIME, rating/duration-granular IG capital. **When a defensible change flattens a distribution, the missing dispersion was being smuggled in by the old model's error.**
21. S11 — bids bounded by money, books marked, income real; the per-name normalisation deleted, forcing saturation clearing: **a bound is not a price; the widest level any actual buyer needed IS.**
22. RVr — credit-cycle amplitude is real (75bp IG band). The CFO's hurdle read MARKET cap, so rich equities halved the float: return on INVESTED capital plus a deployment-flow cap.
23. S5 — the cash walk is one ledger (`post`, Σ=Δ to the dollar); dividends were 10x real and firms bought 2x what they sold — invisible before the ledger, which is the ledger's whole argument.
24. The fantasy contract flow: hardcoded contract sizes were ~90% of apparent volume. **When the price side is real but the quantity is invented, settling the cash converts the invented quantity into real damage.**
25. S6 — every duplicate price-setter deleted; a check that shocks retired fields tests nothing.
26. S7 — one holdings ledger; the macro aggregates were a frozen week-0 snapshot hiding a 284B→1B sovereign collapse.
27. The collapse fixed: tenor-averaged inflation expectations (a credible regime's property, not a damper); liability-driven core as SIZE; profile before optimising (5,280→924 ms).
28. G1b root cause — capacity denominated in DOLLARS: a price rise made the same plant produce fewer units (wrong sign). **A flat median with a handful of runaways is a broken supply response, not a monetary story.** Capacity is physical units.
29. S8 — contagion was a permanent scar (all-time default count); `clearedInputPriceIndex` measured WoW read as a level (rule 9).
30. S9 — player flow: **a write to a derived view is a write to nothing.**
31. WS4 — equity clears in SHARES (a dollar book's size would depend on the price it sets); holders' fair-value disagreement IS the demand slope; seed P/E 66.7 → 10.1 (§7.4 at its costliest).
32. Determinism: all draws through `engine/rng.ts`, seed+position on GameState; every real finding came from the first sixty weeks.
33. HC Wave 1 — ~301 named private firms/region carved OUT of aggregates (conservation is the discipline); the segment's `debtUSD = 2×revenue` implied ~15x leverage and the first carve killed a third of the cohort.
34. WS5 — bills and CP; first CP formulation looked for projected deficits and found no issuer: **size a market off the standing need, not the tail event.** `sovBucketKey` is the ONE tranche-to-bucket mapping.
36. (36–40; no item 35.) The bank flow ledger: reserves were a PLUG; every mutation is a named flow. A perfectly elastic posted-rate window prevents a market forming.
37. S10 — the damper metric (1,349 bound); a cash-drained bank still bids, because it funds.
38. WS7 — money funds: real liabilities, front-end bid, deposit-competition gate.
39. WS8 — primary market; every issuer re-announced on settlement week: a 13x conveyor.
40. G2 — itemized loans, loans create deposits, M2 derived. Transmission measured end-to-end (+300bp → −51% SME origination). Corporate deposits are a reporting VIEW; a facility draw is a real cash outflow from the lender.
41. HC Wave 2 — five ways a market could not transact (state on unowned objects, debut pricing, pre-issue float, stock-split budgets, dry powder read as sponsor cash: **a fund CALLS its investors' money**). 295 LBOs, zero IPOs — honestly.
42. Call protection — SOFT_CALL/HARD_NC/MAKE_WHOLE; accretive calls fell to 0.00B because for IG the premium IS the present value of the saving.
43. The take-private: control premium DERIVED (clear the reservation of the holder who values it MOST); the sponsor bid appears when equities are cheap. A tender's cash leg went into a map nothing read.
44. ETFs — funds born EMPTY (seeding a stock invents the flow); an index fund is a SIZE with no reservation; an AP's capital limits turnover, not warehousing; a pressure named like a price prints a 173% "premium".
45. Households held 2.1x the entire market (`equityHoldingsUSD` = income×1.5 compounding by formula). **Check a stand-in aggregate's SIZE against the real market before trusting anything cleared against it.**
46. L — ledger integrity; L7's "reproduction" was my own `Math.max(0,cash)` clamp: **a measurement that clamps is a measurement that lies, in the direction that makes a story.**
47. MS1 — households own real things (index funds, unowned float, founder stakes); a household runs no research desk, so coverage already made it a 100% indexer.
48. 46% of "unmodeled" was UNATTRIBUTED (740B of claims existing on both sides); naming a gap is not closing it.
49. HH1a — harness green first time; #18 was a §7.4 cold start wearing a growth defect's name (hedge-fund aum seeded from operating revenue). The tell: always week 60, same four names.
50. Every non-financial corporate was the same firm (software spoiling like steel). A topic can exist, be named, and not contain the thing filed under it.
51. HH1b — one insurer, not two (a shell at 0.05B beside an entity at 241.4B). **A refusal outlives its reason; re-check the comment explaining why something is not read.**
52. HH1c — the insurer's hurdle is its cost of float (measured −1.57%: float is FREE); a pension's is its funding need. The other three stay stated — deriving them would be a formula wearing a derivation's clothes.
53. HH2 — the house joins the balance sheet; a LEVEL fed a GROWTH rate and at 4.61x added 1.9pp/week to consumption forever. **A dimensionally wrong expression scaled by a small input looks like a tuned constant.**
54. Task-list mapping (S/WS/MS/BP/AU ↔ audit findings).
55. HH3 — household debt on the banks' books; amortization is annuity arithmetic; #67's bank-capital collapse was the fictional consumer book.
56. HH4a — the cohort cross-section at zero aggregate cost: every propensity a RELATIVE weight renormalized against the aggregate; 40-week paths bit-identical.
57. HH4b/c/d — budgets bite; incidence is the economics (allocating the recycle by equity handed 46% to the top 1%); deposits got one representation and the conservation invariant found two pre-existing defects on its first runs.
58. HH5 — the labor market becomes a market. THREE unemployment representations (one written and read by nothing — grep for readers); the old writer must be deleted when a stage takes ownership; vacancies expire; matching efficiency derived; two §7.4 cold starts faked a broken Beveridge relation.
59. HH6 — a wage somebody decides; stage 08's fixed-field rebuild silently dropped the wage fields AND private headcounts; a relative index is not a growth rate; **verify by lag, not level** (0.71 at 8 weeks vs −0.10 contemporaneous).
60. HH closed — the recession transmission demonstrated (+1.62pp u in a week); making a sector real makes other sectors' defects visible (the equity runaway past w80).
61. PUB1a — interest off the top; only 52% of the bill reached a modelled holder, named rather than netted.
62. PUB2a — CB balance sheet, TGA as mechanism; two lessons in posting a leg twice.
63. PUB1b — the modelled bases supported ~half the stated tax take: no consumption or payroll tax existed.
64. PUB1c — the two missing taxes; **"weekly" was the tell** (no tax authority remits weekly); `mod13` never hits 0; capital income is a share of OUTPUT, not derived from wages.
65. PUB1d — forced take-up deleted; a workaround outlives its reason (give it a date and a condition). Two defects that move together are not one defect.
66. PUB2b — the CB book redeems and places a real open-market order paying with reserves it creates; sized by a real announced run-rate cap (the only kind of constant allowed to fix a number). A pledge outlived its bond.
67. PUB1e — four answers to "what does the government buy"; the right constraint is the appropriated DOLLAR budget, not a price cap; a sweep tells you which half of a gap is yours.
68. PUB closed — corr(interest share, procurement) −0.833; a response is a correlation of CHANGES; a lumpy series has no endpoints (306.6x → 1.3x on trailing sums). A close-out battery is the only place a project's own criteria get measured.
69. PUB3a — government staff were paid twice (wages AND transfer); a third writer had silently won for six slices. **When a number matches neither branch, look for a third writer.**
70. PUB3b/c — the budget is a sum of real obligations; the reverted TGA fix was wrong (**a negative treasury account is a missing instrument, not a fiscal outcome**); the fixed envelope was manufacturing crowding-out (43–58% → 0–4.2%).
71. PUB3d — bills as real discount instruments; a name claiming a distinction the code does not make is a lie the next reader believes; a number that halves after a refactor is a claim to check.
72. XB1/XB2 — `foreignShare` deleted (442B of claims with no holder); cross-border flow chases the spread over the LOCAL short rate (CIP). A constraint that only holds because something else binds is not a constraint.
73. XB2b — a derivative has a supplier; the basis is what that supplier charges (capacity 3.2%→100% under a dealer shock ⇒ basis 4.9→150bp). **A cost with the wrong sign is a subsidy.** A constraint tuned to bind always models a permanent crisis.
74. XB2c — the desks trade; real flow ANCHORS the currency (1.475 with flow, 2.704 without). A sign nothing consumes is not verified, merely unused.
75. XB2d/e/f — FX became a market: who is the desk buying from; a JPN insurer buying EUR bonds must SUPPLY yen (**a two-sided flow built one side at a time loses a leg**); `move/slope` clamped at 8% was rule 15 again; `getFxToUsd` had never returned a real rate.
76. XB3a — `CATEGORY_TRADABILITY` is an observed EQUILIBRIUM (**the test is not "is this number true" but "is it a RESULT of the history I simulate"**); the invoice-currency corner solution was arithmetic between two of my own numbers.
77. XB3a rebuilt — tradability from physics: Spearman(value density, −freight share) 0.897; money had a currency and nobody had applied it; a running economy's pipeline is FULL; **name a rate for what it MEASURES** (two "cost of holding stock" rates 8x apart).
78. Optimisation + the determinism it found broken: three `new Date()` writes into GameState; **a determinism guarantee is only as good as the check that would catch its decay.**
79. Passes 2–4 (1,793→~1,000 ms): the solve became EXACT (segment walk, 4.1e-13 worst); tsx flattens functions to line 1; the profiler attributes inlined callees to their caller.
80. Worker-thread clearing: pack→kernel→accumulate, byte-identical; structuredClone of companies = 328 ms per copy — **packing is the only door**; sub-300 requires columnar state.
81. Columnar wave 1 (946→~850): the holdings store (twenty sweeps → one); two honest nulls recorded.
82. The FX sweep — the CB's reservation was on the WRONG side (in the money 60 of 60 weeks; no threshold can gate a bid from the wrong side); reserve accounting one-signed AND side-inverted — **fix a mechanism only together with the accounting that constrains it**; FX was a dealer market with no dealer.
83. BP1a — the registry exists; the boat probe found demand whole and ZERO producers (hardcoded per-sector templates).
84. BP1 closed — one entry is one product line end to end (boat: 0 → 32 producers); public-producer coverage 17/28 → 28/28 per region.
85. IND1 — physics on both sides: carrying cost from value density (digital inventory exactly 0 units); input lots 112,598 → 1,017; PP&E grows by capex DELIVERED.
86. The bank cohort diagnosed — corporate cash is 7% of the book: **the cash does not exist inside the banking system; do not tune the bank.**
87. SETL1 — the settlement layer exists; dividends left the payer and arrived nowhere; coupons computed twice.
88. SETL2 — corporate cash is somebody's liability; asset and liability move in the same statement (identity 0.0M all 16 banks).
89. SETL2b — a loan creates a deposit: **record the event where it happens; two stages owning halves of one event a week apart makes it inexpressible.**
90. The boundary decomposed; a flow whose counterparty is credited by another stage must NAME it — routing to the boundary duplicates the money.
91. SETL5/3 — the conservation gate: institutional cash volatility was always there; it had nowhere to show until money became somebody's liability.
92. SETL4 — a payment to a bank on its own account moves reserves AND equity; goods legs routed; wages split by the firm's OWN payroll.
93. The last tranche cannot be instructions (books read capacity net of prior books) — settled T+1 with reconciled reserve legs. The 4e16 "employment disagreement" was a wrong field name behind a `Math.max(1,…)` guard.
94. Any `Math.max(1,x)` around a divisor is where a wrong read hides; the private segments were half the economy with no books.
95. SEG first design half-assed: **check the something is real before giving it books — banking a fiction carefully leaves a fiction.**
96. SEG rebuilt — one pool per (region × industry) seeded from its own demand; seven tables deleted.
97. **Giving something books is a way of FINDING missing flows** (carriers/MMFs/ETFs banked nowhere; fx-hedging reverted settled sheets; a book that goes negative names the missing flow). `SME_WAGE_GAP` is load-bearing.
98. OWN — ownership measured off the real books; harness 88→488 was one clamp dying (conservation had passed BY CONSTRUCTION). A carve and an exclusion are the same subtraction. **Check what a passing invariant actually asserts.**
99. Banks are not firms here — the skipped operating branch also skipped payroll: rule 14 applies to flows a dispatch table let you skip.
100. The 90-finding review: a formula that outlived its mechanism keeps deciding (grep for the number after closing); grep for met exit conditions; a silent default is a dead-code justification protecting a live bug; comments about behaviour are claims; an aggregate check can pass while a category screams; reframing beats enumerating.
101. One harness; a quirk the baseline depends on is part of the baseline.
102. OWN8 — a ceiling that was an accounting identity (it EQUALLED the position it bounded); found by a user question, not the harness: **a market that clears nothing satisfies every check written about its price.** A securities-book bound must be a bound on its FUNDING.
103. SETL6 — the CCP is flat by construction; a trade is a PAYABLE until it settles; 07f's bank writes had never landed (`updatedCompanies` is rebuilt): **companyUpdates is the only bank-sheet write that survives before stage 08.**
104. OWN7 — the float is what the participants in THIS book hold; make the comparison correct FIRST, then look.
105. GUARD — silent defaults throw; two were live bugs (no seeded `listingStatus`; consolidated tranches lost call protection). A holding ceiling may not equal the position it bounds.
106. FRM — four formulas deleted, no new mechanism: read the number that already exists.
107. The week's cost measured: stage 05 was half of it; the shock batteries are three-quarters of `npm run verify`'s wall clock.
108. IND-R1/R2 — payroll is common to every firm; `FINANCIAL_SECTOR_PROXY_LINES` put banks in the software market (shares summing to 646%). Verification gates the VALUE of a change, not its correctness.
109. EMP — the seed solves affordability in AGGREGATE, leaving half the distribution below the threshold; the shed rule was ONE-SIDED.
110. EMP — symmetry restored (hire AND shed; the wage's mirror is tightness), and it is not enough: **price adjusts on an annual timescale, quantity weekly.**
111. EMP third pass — revenue/worker 1.13x value added (impossible below 1 in two sectors); the model was internally consistent at the wrong depth: production had no DEPTH (intermediate share 14% vs real ~55%). Owner CHAIN.
112. IND5 — electricity: IN_PLACE physics makes it the one non-storable good with no line saying so.
113. IND8/9 — IND9 was already closed (re-measure before working); every firm of a size was the SAME firm (zero BBB, zero HY — the cohort the credit books price did not exist); apply a covenant ceiling ONCE, never iterated.
114. IND2 — a subscription is not a unit; the private path's fixed field list swallowed its third field.
115. IND-R6 — the private tier paid NO wages (46x the bank version); **a forked path lets SEMANTICS drift** (gross vs net margin under one name) — copying the treatment across double-counts.
116. The work order reconciled: a project's tier is not knowable until its cause is; close a row precisely.
117. CHAIN-D — a BOM is a property of a PRODUCT (16 industry recipes had collapsed to one overhead line); the ratio moved 0.878→0.879: **the number that moves when you fix a thing is the test of whether you found the thing.** The real root: no intermediate demand in the seed.
118. CHAIN-E — intermediate demand exists (`X = F + AX`); headcount = value added over productivity via `1/(1−a)`; consistency between numbers you chose is not a measurement.
119. One headcount rule for three tiers; the firm universe's value added was 53% of GDP — each tier's overstatement covered part of the same gap.
120. The identity lived in THREE places and the copy you did not know about decided (1,481B vs 567B): the same identity written three times will diverge.
121. IND3/CAP0/IND-R6 — the margin became an outcome; the [2%,65%] clamp died; the listing branch DELETED (107 lines); every unemployment violation gone.
122. Financial firms into the same build: the CONTRACT let them out (a profile could state a margin); a firm that sells nothing still BUYS.
123. CORRECTION — a fund is not a firm: **"one representation" is about not modelling ONE thing twice, never about modelling two different things the same way.**
124. The sovereign float counted paper nobody was selling (~20% with no real book); two id spaces for one instrument (bucket vs tranche) collapsed the float when read wrongly.
125. IND finishes: a profile may no longer state a margin; EBITDA computed in exactly one place; harness GREEN for the first time (18→…→0, every step a real defect surfacing).
126. The MMF issued shares to no holder; `evolution.ts`'s fixed field list destroyed the household's claim weekly (third instance).
127. G1b diagnosed: a SUPPLY FAMINE printing a FALLING price (8x shortage, price −92%) — reading the falling price as deflation is what hid it for the model's whole life.
128. The commodity market had two bases for its two sides — invisible while recipes were shallow, structural once demand tripled.
129. CAP — capex had no term for "I cannot fill my orders"; deflation got WORSE and was recorded: **an investment response without a production-stopping rule is half a control loop.**
130. RULE 15 fourth time — a seller's reservation was a fraction of the market price: no shortage can stop a fall when no seller is ever unwilling. A cost is a dollar figure.
131. IND-R3 — per-good consumption intensity; five principled fixes and the LEVEL still worsened: **a metric that moves the wrong way under five independent correct fixes is not caused by any of them.**
132. MAC(a) — prices falling into flat nominal demand and a shortage is price FORMATION: the floor's cost still CHASED the price (inputs = intensity × revenue). Rule 15's subtlest form.
133. Negative result kept: per-head overhead ties a cost to a collapsing quantity — **a sticky cost must anchor to something genuinely sticky: the WAGE, not the wage bill.** Declining to ship a change that fails its own test is not clamping.
134. IDX — an index is a statistic with no bound; beta is measured, not stated per sector; no published name is a real brand.
135. DEM first half — the clamps died; "Japan shrinks" is an OUTCOME; the legitimate mechanism is the demographic transition.
136. IND4 — funding mix from what the money BUYS; `cyclicalityBeta` deliberately NOT added (a brief can be stale; the rules are not).
137. IND6 — share vs margin expressed only through the real offer price, off the firm's own inventory position.
138. IND7 first half — antitrust holds are measured; the divestiture NOT built because a spin-off must MINT a register (extend the ownership machinery first or undo OWN7).
139. CAP — a firm that cannot cover unit cost STOPS producing; that is what makes a downturn end; first improvement in the chain (−25.5→−21.9%).
140. DIST first slice — a pool's default rate read at the MEAN meant a mean-preserving spread could not cause a single default; strata are quantiles of the SAME draw (no imported dispersion).
141. DIST — the cash term: at exactly the target cover the scalar reports 0.0000 stress, the cross-section 0.0357. **A scalar is blind precisely in the approach to a threshold.**
142. DIST/COH — the wealth MPC derived per tier reproduces the wealthy-hand-to-mouth middle the stated table could not express: **reproducing a known pattern WITHOUT being told it is the point of rule 4.**
143. DIST — the absorbing barrier: exiting weight drawn by distress, reinjection unlevered — the cleansing phase a scalar cannot represent.
144. DIST/COH — the deposit split is an outcome of who saved (flat 25/25/25/25 → 19.3x top-to-bottom in 104 weeks): a distribution that emerges from a flat start is derived.
145. All NINE stated cross-section tables became measurements, each with a DIFFERENT cause; housing is BORROWING CAPACITY, not wealth, which causes the hand-to-mouth middle.
146. IND15 — labour constrains output: **a mechanism that binds on nothing is a mechanism that is not there.**
147. IND10 — WIP is a real stock ($69.5B that did not exist); no change at rest is the correct result.
148. IND11 — the backlog is a stock; contracts settled against LAST week's closing stock so every contract under-delivered permanently and an unfilled order evaporated. Order: PRODUCE → DELIVER COMMITMENTS → AUCTION THE REST.
149. LAB — the hiring branch had NEVER fired: this week's dollars over seed dollars with no deflator. **Rule 9 is about periodicity; a price level is part of the number too.**
150. IND12 — domestic trade credit was gated to cross-border by one line; 65% of invoices are domestic; receivables = payables exactly; the lead→receivables relation EMERGED.
151. IND13 — a machine on the loading dock is not plant (commissioning leads); the stock made capex-vs-depreciation visible for the first time.
152. IND14 — reliability is a supplier attribute IND11 made measurable; smoothed deliberately: reliability one good week repairs is not reliability.
153. IND19 — the row hid a DOUBLE CHARGE: a cleanup that removes a charge must chase every cash leg balancing it.
154. IND17 — prepayments: delivery settles against the deposit FIRST; the lead does the filtering, no category list.
155. IND18 — the calendar: one cosine per side, averaging exactly 1.000/yr; a 10-week probe now samples ONE SEASON.
156. IND closes — the three ways a mechanism binds on nothing: the thing does not exist yet, the units never trip, or a cleanup removed one side of a pair. None findable by reading the logic.
157. Where DIST pays: carry the distribution only where the decision is NONLINEAR; find every threshold whose argument is an AGGREGATE and ask what fraction sits on the other side.
158. TRIED AND REVERTED — buffer-stock saving without separating buffer from long-horizon stock (GDP → 2.1e21): **a stated shape parameter stands in for a missing mechanism; deleting it first makes the model wrong, immediately and violently.**
159. DIST/HSG — the mortgage book as a cross-section (one avgLtv had made a credit event impossible short of −55%); collateral does not amortise.
160. HSG — the reset was completely missing (no existing borrower ever felt a rate rise); a reset changes who defaults; borrowing capacity sees the rate.
161. DIST — pool distress layoffs integrate over strata: 19 of 64 pools solvent in aggregate with distressed strata; only 2 visible to the old rule.
162. DIST/CRD — three one-way ratchets in the credit tiers; and MY diagnosis was wrong first: **a seed value is not evidence about a mechanism — read the evolution path.**
163. Household liquidity measured at 23.7 weeks: the recorded cause of §7.158's failure could not produce it. **A cause is not established until it is measured; a confident write-up makes a wrong cause harder to dislodge.**
164. The 2026-08-30 rescope — the work order was ordered around two NUMBERS; rule 18 now forbids that.
165. DIST 1(a) — the savings rate is an outcome; the failure was a units error (`shareOfIncomeUSD`, a DOLLAR, used as a fraction — three stories before one measurement; findable in thirty seconds by printing the number).
166. DIST — households can sell; it reaches $0.0B of $985B because only fund shares have a channel: **a holding that cannot be sold is not a holding.**
167. CAP — maintenance capex was an EMA of itself; the anchor is depreciation. **A clamp covers for a decision not being taken; delete it only after the decision is real.** Exposed: an 8% capex fill — nobody can make the machines.
168. CAP — the capex famine's rule-3 defect: investment represented twice (sized for 54B, bid 83.6B); the capital-goods self-limit is real, not a defect to chase.
169. DEM — the age structure existed and nothing read it; the life-cycle saving rate is `r/(w+r)` = the retired share, no free parameter.
170. Rule 19 first pass — 16 stated shape parameters retired (8 read by NOTHING). When a stated table has an exit condition written on it, check whether it has been met.
171. Rule 19 second pass — a table alive only as an opening condition is deleted by seeding the MECHANISM, not the outcome (~74 → ~42).
172. Rule 19 third pass — wage dispersion measured p99/p10 = 1.01x vs the stated 32.5x; the stated multiplier was load-bearing: deleting it would flatten the distribution, not derive it. The missing mechanism: rent-sharing.
173. Rent-sharing built — dispersion 1.01→1.40x, correctly sized: **a measurement showing a mechanism works can also show it is the wrong mechanism for the deletion you meant it for.**
174. DIST 1(b) — the experience cross-section on DIST's own machinery; ~2.5x within-occupation; 32.5x within one occupation was never a plausible wage fact.
175. DIST 1(c) — cut-point invariance with an AFFINE CONTROL (0.0000%): a test that reported ~0 for everything would prove nothing. Read "nonlinear" against the DECISION, not the quantity.
176. CAP — the clamp programme closes (five bounds deleted, each with its mechanism now under it); the carrier floor learned about capital (what a ship costs to HAVE).
177. CAP — capacity off PP&E tried and reverted per §7.158's rule: the walked rate STANDS IN for missing capital-goods supply.
178. CAP/rule 3 — the capex categories' demand was a frozen seed placeholder beside the firms' real capex; an honest level fixes the SIGNAL before the stock.
179. COH2 reversal reverted — second correct change blocked by ~29% unemployment: **when a number blocks unrelated mechanism work, closing the gap IS mechanism work** (rule 18's other half).
180. SUPPLY/CHAIN — investment allocated two different ways in all three identity copies; a corporate purchase of a non-capital good is INTERMEDIATE demand.
181. DEM — people age (single-year distribution, Gompertz hazard); the seed's age structure is the stationary distribution of the region's own birth rate; the life-cycle saving rate falls out.
182. COH2 — contributions come off working cohorts only; a fund pays out over the years its members actually have.
183. HSG — the house price clears: **a house sells at what the MARGINAL BUYER can pay**; the floor is the construction sector's own cleared build cost.
184. CRD-R1 — a rating is notched off measurements the model already takes; an absent field applies no notch ("no opinion", not a default). A rating cannot be notched off a sentence.
185. G3a/G3e — the dealer desk is a named bank's business, an ordinary participant whose schedule width is the book's own bid-ask; cash inventory consumes leverage. Exposed: the dealer's book had never been subtracted from the float; equity trading was free; 07e's float was the whole company.
186. G3c — five posted bank prices became decisions: wholesale at the bank's own OAS; the deposit rate a real choice (a liquid bank pays zero — watch); the underwriting fee derivation reproduced all three of the table's levels; the lead bank was a hash.
187. G3b — the player's dealers were the second dealer system; an axe is where the desk is actually long; the discount falls out.
188. REPO — a repo is a contract with two named parties and specific collateral; the term split is measured (rolling = structural = term); a checklist in §5 is evidence of a defect, not a specification.
189. XB6 — the FX auction ran on the wrong currency: **auction the currency being SOLD.** One defect, both directions, invisible to sign checks.
190. HF — four funds instead of one; leverage got a LENDER (prime brokerage at a derived haircut, widened by concentration); withdrawal is the point. `HOME_BIAS` was checked rather than inherited: the bound is already a bound.
191. DER — IRS: the receive-fixed reservation is the same-tenor government bond, which is why a swap spread exists; the first CROSS-MARKET basis this model produces.
192. G5 — a default resolves; nothing states a liquidation horizon (each asset leaves at its market's absorption rate; the discount is the buyer's required return over the wait); recovery is an OUTPUT; both folded constants died with the mechanism — the test a mechanism is real.
193. NAT — the seed stopped importing prices (heavy crude seeded ABOVE light was the tell); primitives are physical; weather reads exposure off what each region produces; the pledge follows the paper.
194. CAL — interest accrues to the register and pays on the date; the started revert was wrong — **the disagreement WAS the finding**; the floating leg pays compounded cleared GC repo (OIS).
195. The settlement sweep — 02b's reconcile was already measuring the bypass (12.2B/10wk, 11.6 institutional); the plug that keeps the identity green is exactly why a second way of moving money survives.
196. CASH — the week gets TWO settlement cycles (intraday + close); an overdrawn index fund was re-plugged weekly: **the defect paying for its own cover.**
197. OWN7/CASH/PUB — boundary 25 → 6 reasons; the float claim falsified by measurement; the seed minted claims (institutions opened at 132% of the corp bond stock); **the residual dealer is DELETED** — a seller that finds no buyer keeps its paper; the treasury auctions its paper; damper 890→1030 is the honest shape: the pressure was always there.
198. CP clears with its own register (money funds hold it — why a CP default is systemic); its walk-away is the revolver; **a desk's prior position is a FACT, declared before any float test.** The carriers' cash legs wired (two anonymous ends of one payment whose parties were both known).
199. The seed had a circle (revenue→capex→I→revenue) closed by a fixed-point solve with the RNG rewound; COH1 split spendable from accumulated; the pension contribution is the saving households already decided (a flat 9% was its second representation); a tautological identity assert deleted.
200. HSG last constants — every bank quotes its own mortgage; two stale plan rows corrected: **read the code before believing a row.**
201. CDS clears (the float is the protection somebody NEEDS, off the large-exposure limit; the sellers' reservation is the bond book's arithmetic — the difference is the basis); a no-earnings firm rates off liquidity; one vol estimator; ETF overdrafts: the same dollar budgeted once per fund.
202. G5 remainders + HF short — a firm draws its committed line BEFORE it defaults; a short is three obligations (borrow, locate, recall/squeeze), and the squeeze loop falls out unwritten.
203. DER closes — the commodity curve clears (the convenience yield is what the curve IMPLIES); storage desks hold the top of the curve (free money otherwise); corporates hedge in the SAME auction, widening the basis for funds.
204. COH4's savings destination — the 0.3 constant was already being decided one file away; the constant is the SEED and nothing else.
205. IND16 — the channel margin moved ONTO the goods (paying the same sector twice would look right on both books); the margin is the good's own physics; a service exempts itself. CRD×COH: two partitions of one population go on ONE axis (the buffer). ETF in-kind: why an ETF cannot be run on.
206. The ETF share book (no AP creates below NAV; the premium's bound is the cost of self-assembly); the tax rate got ONE owner (reported 21%, paid 31%); two untrue doc comments corrected.
207. HC3b — revenue is what was sold (the formula's full shape recorded so it is not rebuilt); the boundary's biggest line was a readout of the formula disagreeing with the auction. DECLARED RELABEL (an RNG draw died).
208. The four deferred items, each already answered by a §1 rule: TIER_WAGE_MULTIPLIER derived (bands of the joint tenure×firm-premium distribution; one band-operation owner); the wage LEVEL derived (labourShare = 1 − (1/life + structural cost of capital) × K/VA ⇒ 0.76–0.81); the household bid became a SCHEDULE (rungs cut on the QUANTITY axis — exact at any rung count); CAL built whole (banks keyed by PARTY; paid as BANK_SECURITIES). The master file compressed 7,247 → 1,272 under rule 11.
209. The first run since §7.199 — the harness had died at week 1 on `0/0 → NaN` (guard the DENOMINATOR); an assert that names the wrong thing is worse than none; two ladder corrections (the reach is a multiple of the BUDGET, never of a price — a price-referenced ceiling compounded 10%→455% in five weeks; truncate the ladder at the whole-want reservation).
210. JPN's 66.8% — a bisect names a commit, not a mechanism; the quit rate was LINEAR in tightness beside the concave matching function it contradicted (rule 3), and tightness = vacancies/seekers is an unguarded ratio the seed drove to 215. **Prefer the defect that crashes.**
211. THE 60-WEEK READ — 647 violations / 92 families: structurally sound, dynamically divergent (different properties); the price level neither settles nor compounds — it oscillates at an absurd altitude; the top families named the next work.
212. The optimization pass (1872→1756 ms): my own §7.208 regression (a registry walk per call, quadratic); the worker pool buys nothing on 4 cores; no hot spot — a universe being walked; sub-300 is a world relabel that now costs §7.211's measurement programme.
213. Why 300 ms is not a bug hunt: numerics are 70 ms, ~1,400 is orchestration over the object graph; cutting the universe 4.4x gains 1.85x; GC 8.5–8.9%. Free finding: the register opens at a quarter of its steady state.
214. Under 300 ms via the roster as a conserving RESOLUTION parameter (padding clones had been ADDING revenue — rule 13); 1467→205 ms at 0.12 scale; a flat `Math.max(20,…)` floor impersonated a law of nature: **print the count before believing a floor.**
215. Full fidelity 1360 ms — run compiled JS (bit-exact, restores line-level profiling); Bun slower; dictionary-mode not the cause; netting measured SLOWER (144,650 distinct triples are real relationships); nothing is 5× anything.
216. What line-level profiling found: the accrual ledger converted container→container→back (5.25% of CPU, for a reader that does not exist); ETF flows quadratic in the register; **a flat profile is a statement about the profiler until it can resolve lines.**
217. Wave 2 milestones 1–3 (party int32s, CSR register, columnar payments; 1418→~1200 bit-exact); the ledger was the wrong shape twice; a weekly consolidation A/B'd at break-even and kept; the remaining value concentrates in the company table.
218. Wave 2 phases 1–5: the machinery exists, the conversion does not (one consumer converted; timing unchanged — the honest headline). The company table's value is what a worker can take without cloning, not field-read speed.
219. The three claims tested: the clearing FUNNEL ~440 ms vs kernel ~120; "88% shardable" (later falsified); adapters are 2.8 ms of arithmetic in 440 of packaging: **establish the cause, then project.**
220. The scoping failed and that IS the answer — no dominant block, established four independent ways; ~40 stages each doing moderate real work. (Its own projections violated its own rule — see §7.221.)
221. Audit of §7.220: **a classification is not a measurement** — "88% shardable" was an opinion about stage names; the experiment that settles it is to shard ONE real stage.
222. The parallel fraction MEASURED: permute the loop order and hash the world. Stage 08's order-dependence was ONE shared PRNG (re-keyed per entity ⇒ bit-identical to 17 digits); **stage 05 is serial by construction — firms share one wallet across sequentially-opened markets.** 100 ms on four cores is out of reach, now with a measurement behind the sentence. The permutation test is the tool.
223. The re-key built: entity-scoped RNG (a RELABEL of every draw); stage 08 as a sharded kernel with shard-order combines, same world at SHARDS=1/3/8; the worker pool still needs columnar state — do not report a speedup from inline shards.
224. The long-horizon failure was one goods-market defect AT WEEK ONE (seasonal factor inside the shutdown test idled whole categories; CPI base/current were different price concepts). Violations 1,792→641. **When a long run fails, measure the first week, not the failure.**
225. The sector mismatch located to one switch (every firm sized off ONE hand-named industry); the obvious fix overshoots 3.4x because the rank curve is applied to templates then padded — the fix belongs AFTER the padding; §1.20 does not ask anyone to ship a worse world.
226. A fund distributes what it HAS (PEF1 paid 0.495B from a 0.000B balance); the repo reordering measured, wrong, reverted: **read the run's total, not its first twenty weeks.**
227. The sector split fixed by one normalisation over the FINAL roster (spread 2.4x → 1.04x); the harness got slightly worse and the change is KEPT (§1.20): the old print was a defect flattering a measurement. The stated SME share is what pools were sized FROM, not what they hold.
228. The speed question closed by exhaustion: the engine got slower because it started WORKING; no hot spot (top frame 6.38%); workers cannot have the data (clone 365 ms vs a 305 ms stage); the register win is dead; the roster invariance test FAILS on this world.
229. The architecture audit — the SME lock was possible because the rule had nowhere to live (7,736 domain vs 24,595 stages); money not conserved (the reconcile INVENTS reserves; the clamp destroys negatives); a security is a display struct; Government did not exist; the cost of adding a type measured (75 sites/17 files).
230. STRUCT steps 1/3/4 — the ledger owns money; four defect objects; the fiscal and pledge checks were measurably wrong; the registries reconcile FOUR taxonomies; hygiene ratchets. And §7.229's "43 stray writes" was a MISCOUNT — §7.221's failure inside the audit that names it.
231. Step 5 — stage dependencies MEASURED, not declared (79 backward edges over 11 fields, none previously written down); a stage move is now checkable in three weeks instead of sixty.
232. Step 6 — the seed vs the settled world on six lines (WIP opens at ZERO; fill 1.00→0.648); SEED_BURN_IN built and OFF: turning it on re-bases every number in §7 at once.
233. The post-STRUCT baseline 515→1,130 decomposed: +184 the pledge check got six orders stricter; +53 the fiscal check measures the budget; −149 real closures; +160 one real regression (EUR). **Do not compare totals across check changes.**
234. strict:true cost 41 errors, not thousands (measure, don't assume); it found a dead 'ASIA' loop and a check that had never fired once (deleted, not repaired); 23 unit tests (the SME lock is four assertions); CI without the harness — a check that is always red teaches people to ignore the build.
235. `companyUpdates` typed (22 undeclared cross-stage fields; a latent partial bank sheet); ESLint tuned to paid-for defect classes, style rules absent on purpose; its first run caught my own residue; one rule deliberately downgraded — churning twenty clean sites is how a linter loses authority.
236. Step 2 started — capital-programme and credit-standing extracted, bit-exact, with the tests the extraction makes possible (the §7.151 defect is two assertions).
237. Step 2 continued — the fingerprint caught two errors reading could not (an `ebit>0` guard nuance; folded cost lines reorder float subtraction): **an extraction that reorders arithmetic is not a refactor.** Found: the two paths tax a loss differently.
238. Step 2 complete for the kernel — seven objects, 659 lines, 71 tests, all bit-exact; three of seven failed the fingerprint first; the lint ratchet caught its own author; the kernel's line count ROSE and that is the wrong measure.
239. The plan cleaned against §7.221–238; a row that keeps a dead number keeps sending people to work it.
240. THE LINE-BY-LINE AUDIT (~130 verified findings): the bypass traced by reading (etf-flows had NO pay() call); the ratchet could not see the spread-form write; the §1.3 duplicate cluster; live rule-2 clamps; one-sided flows (the swap book never netted; the FX forward paid its CUMULATIVE mark); real-world equilibria still imported; dead state; instrument/UI rot. The bypass was findable by one grep nobody had asked.
241. THE ENFORCEMENT AUDIT — what wrong code still compiles: unprotected state (the whole-sheet channel, 15 writers; bankEquityUSD 13 files); the currency suffix lies on thousands of fields (one live bug: the cure constant on two clocks — consumer credit priced off a 52×-understated loss stock); five old cores are not unions; id spaces multiplexed in `string`; 220 nonzero fallbacks (~70 invent economics; journalPayment silently dropped NaN); ownership roots of every open row. Enforcement is extension of existing house patterns, not invention.
242. THE BACKLOG EXECUTED — eight commits, six §6.1 rows closed by fix (the cure clock, SME margin loop, strata exit rate, deficit force-place DELETED, delta variation margin, 07g netting); pay() throws; traced writers converted (the double-NAV fee, the zero deposit rate found by exhaustiveness); ratchet learned the spread form and caught its own author same day. A conversion that cannot yet be a payment must at least be a COUNTED credit.
243. The seed guard's first fire — the one pure intermediate had been priced $0 and shipped weightless its whole life; same §7.127 rule, intermediate-demand-over-producer-volume branch; **prefer the defect that crashes; a guard built unrun fired on its first run and was right.**
244. THE NEW BASELINE 628/94 (the §7.242–243 world): EUR is a NOMINAL outlier; every carrier dead; vacancy 2.0e9%; capital-goods fill 0.00x; the §7.242 conversions worked where aimed (corporate bypass 3.9→0.7B at ×90 the price level); the accounting spine survives hyperinflation — the price level is the work.
245. The EUR row worked — stage 03's capex branch `return`ed before the budget write, so stage 05's deleted-derivation fallback sized the government's bid off the demand LEVEL with no appropriation (fiscal 58→5; the terminal explosion was this). The CPI runaway did not move — two defects that move together are not one. The runaway located: four IN_PLACE services whose floors chase their own cleared price.
246. The service-cost mechanism — the floor's wage component tracks CURRENT staffing; the wrong-signed production price-response factor DELETED (§7.28 surviving in the utilisation): 361/67, CPI ×2.71 with w60 inflation FALLING — first sane long price print. The capex famine INVERTED (0.56x), voiding §7.179's attribution: the u-ratchet needs a fresh diagnosis. Measure at the departure, at the firm, at the book.
247. Demand-pull hiring — the persistent shed driver was the growth signal, SELF-REFERENTIAL (revenue limited by own staffing); the pull is the definitional demand/supplied ratio, capped at full staffing (stage 05's physics on the hiring side); **a mechanism whose failure arrives after week 50 is invisible to every shorter probe — the 60-week run is part of the loop.**
248. Repo over-pledge 129→2: each week's pledge equalled the PREVIOUS week's holding (the fiscal redemption shrank the scalar, not the book's pledges); the pledge follows the paper ON THE BOOK at the maturity site.
249. The week-52 seam decomposed (YoY base effect — honest; the 10Y damper release; teleports); the labour deflator fixed at the root: deflate by the price of what THIS employer sells over the SAME window (rule 9 twice over).
250. The seam closes (320/60); the FP instrument rebuilt as a harness module; **four post-08 stages wrote bank sheets to a DEAD CHANNEL** — the banks' bills had never accreted and write-offs never landed, for as long as those stages existed (both legs dropping together so no identity broke). All four on the LIVE sheet now; the channel write throws after stage 08 consumes it.
251. The reference on the revived tree 367/60 — the count ROSE because flows that vanished now land where checks see them; the UK institutional exponential got a pointer (corpBondOwnership >1); the identity drip and NIM decay are one bank story.
252. The M-scale identity family was ONE missing credit event (07f's failed-CP-roll revolver paid BANK_CREDIT but never recorded the event; the loan arrived a week late via 02b). Found at stage grain with BANK_IDENTITY_TRACE; two hypotheses died on measurement first. **A level-based reconciliation converts a missing flow into a one-week blip — the reconcile that PLUGS is the reconcile that HIDES.**
253. Reference 278/44 — zero identity breaks at 60 weeks; the UK exponential NAMED: equity marks compounding ~13%/week from ~w50 (every credit line flat) — the consequence row arrived early and region-first.
254. The NIM decay decomposed: the statistic ignored settlement-paid interest (a second derivation of the income statement, rule 3) and the seed wholesale stock had no flow (the roll built: a bank holding cash beyond its LCR need does not renew). USA NIM 41→0.
255. The Tier-1 pass — fourteen slices in one day, each measured before/after (currency salads, one-owner kills, fund overdraft budgets learning about each other, MMF distributes the book's excess not a quote, the tax pair DECIDED and deleted, share renormalization, corpBond estate window, facility retirement credit event — a regression caught by bisection: 4-week probes missed a w7 onset, §7.247's lesson re-paid; the bill discount real; freight fuel at real utilization; the vacancy guard FIRED at week 1 and was right; bands all regions; upstream-first opening order; seed undersupply hand-reconciled to a level decision). §7.254's wholesale causal claim corrected: the roll stands on its own economics; the record's claim does not.
256. Reference 204/18 — nine families closed at scale, the 10Y released for the first time; the COST (§1.20): EUR re-based into a fiscal-labour spiral (57.1% u), the next diagnosis; the new UK bands show a cohort failing unwatched for the model's whole life.
257. THE EUR SPIRAL'S ROOT — the household's budget was a slice of the DEMAND LEVEL, not its income (price↑ → buying industries' nominal revenue↑ → level↑ → household handed a bigger budget → price↑); stage 03 computed the honest leg and threw it away — the unanchored copy won. Fixed at the owner (`householdDemandUSD`); EUR electricity p32→39 over 20wk where it hit 4,061 by w13. Differential kit kept: SPIRAL/SPIRAL_PRICES/PX_FOCUS.
258. Reference 169/18 — the spiral dead at scale, all four regions cohere for the first time; CPI ×2.269, w60 inflation 20 falling; the equity-fund overdraft class TRIPLED (relabel's redistribution); the 10Y re-pinned.
259. The UK bank cohort's killer — `settlePricedOfferings` ran between clearing and desk-fill apply, so the lead bank's firm-commitment residual was paid for in cash AND charged to equity as a phantom fee while the rebuild deleted the position (1.6–3.1B/week per lead bank, every region, the desks' whole life); the residual row dropped `units`; a credit retirement had no holder leg (holder-paydown built, paying scaled-away principal from the same boundary the borrower repaid into). All 16 banks end w20 healthy.
260. The carrier deaths decomposed to one named question (later answered by §7.267 — the live market pays the same as the seed's auction; the "6x" was the frozen revenue statistic of dead firms); the seed burned fuel at full sail (fixed).
261. Reference 99/13 — UK capital gone, EUREQX 34→3 (the paydown WAS one fund's missing income), best world to date; queue named.
262. The small-cap ETF overdraft class — in-kind redemption's cash slice promised from an undebited balance (each redeemer read `fund.cashUSD` unshrunk); the index fund's cash bound struck at the reference price while paying the cleared one (commit at refPrice × (1+cap)).
263. Tier 2 opened — BYPASS_TRACE built; then CORRECTED same session by reading the settlement order: stage 08 never writes comp.cash (settlement is the one mover), so settle:false posts cannot be bypass; **the corporate reconcile class is POPULATION/IDENTITY events** (wind-ups, mergers, deaths, births, reassignment) — that is the Tier-2 work list.
264. The first population event converted — the estate seizes the debtor's cash by instruction (the dominant feeder: bypass 3.0→0.7B/wk); the clamp measured both ways and KEPT: ~4.5B/week of negative balances are a missing overdraft-facility mechanism, now with its price tag.
265. The overdraft conversion built — a settled negative balance becomes a real facility draw (loan creates a deposit; no headroom test: an overdraft is credit already extended); 2 violations in 2 families at 20 weeks.
266. The fund refill path — investable is SIGNED, so an overdrawn fund sells back to solvency; OD_TRACE confirms convergence.
267. THE LIQUIDITY LADDER'S FIRST RUNG — a treasurer redeems its own MMF shares before borrowing; **the carrier deaths were this**: the sweep dug the grave (emptied account → negative → default trigger reads cash, never shares) and the `!isDefaulted` gate held the shovel. 12/12 carriers alive, first full cohort ever; logistics 0.4→3.1B/week.
268. A bank is rated on its OWN sheet — the corporate rating context fired the no-earnings CCC branch on solvent banks (the UK NIM family was the funding cost of that mis-rating); creditMetrics' bank branch read the REGION-AGGREGATE ratio. USA banks AA, UK A; VOUL's OAS 516→238bp.
269–270. (In the commits of the same names: §7.269 — the full-staffing ceiling scales with the plant, one derivation for stage 05's staffedShare and the labour cap; §7.270 — the index fund's credit-book bound reserves the dealer fee; the backlog check aggregates per contract key.)
271. REFERENCE 52/18 — carriers 12/12 at scale (family closed for good), bypass 0.8B/wk, CPI ×2.138; the small-cap class migrated to USAEQX and halved; §7.269 alone did not bend the 60-week u endpoint (the capex channel binds it).
272. The seed-undersupply "one number" — stage 03's weekly rebuild still double-counted intermediate demand (fixed: the level is C+G+capex; the solve owns the intermediate); the "3x intensity-vs-BOM" claim was an estimation error (~1.4x, the sizing gap); **the units gap is mostly the household WANT-VS-BUDGET WEDGE** (the ladder posts physical satiation; goods-fill is want-fill) — measure capex starvation on MONEY bids.
273. The fund keeps its own fee as a cash sleeve — `investable = (holdings+cash) × (1 − expenseRatio)`: its own measured obligation, no new constant; the USAEQX 21x chronic dies.
274. The three optional ledger fields are REQUIRED (estates, both accrual ledgers) — the resetting-default trap closed at the type level.
275. One API for a bank's P&L write (`bookPnL`, throws on non-finite, PNL_TRACE) — eight sites converted, non-P&L transfers deliberately not; **the 02b reconcile deletion GATE-BLOCKED, measured** (the stock reads 61.4B by w10 with the overwrite off — route the early-regime flows first). Reverted per its own gate.
276. The reason-category enum beside pay()'s free text (classified at intern time; an unmatched reason is a violation the week it is written); the last Tier-1 flips (`isBillBucketKey`).
277. P1 executed (the two named renames, every site); MONEY_SPREAD_BUDGET 23→16; **the brand pass deferred by its own seam rule** — a brand with unbranded producers is theater.
278. Step-5 edge annotation done — every backward edge is a named pipeline structure (`DELIBERATE_PIPELINE_FIELDS`); an unannotated backward edge now fails a STAGE_TRACE run.
279. The View half of the BankBook split (`Readonly<BankingSector>` — a field poke into the aggregate no longer compiles); `mandatePctOf` — the first registry-dispatch conversion (two divergent if-chains became one Record).
280. MAC's fiscal stance reads the government's OWN budget: above INTEREST_SHARE_OF_REVENUE_RED_LINE (0.25) the stance consolidates whatever the cycle says; below it a package scales by fiscal space. The budget binds before the ballot.
281. The household direct-equity sell channel — the residual is a POSITION now: announce (etf-flows, the ladder's owner) then price (07e next session, seller at reservation zero, damper still bounds); the residual SHRINKS by construction.
282. The FX spread has a payer — the converting firm pays 2bps of invoiced value to its home-region banks pro rata ('fx conversion spread'); swap lines stay gated on their stated prerequisite (an FX funding market).
283. IND7's divestiture built with the register mint it waited on (spin-co shares pro rata to holders of record; parent price steps down by the carve-out; stage 10's quarterly clock, §7.138's sustained hold); COH's last slice NOT taken (a full seed re-base, SEED_BURN_IN-gated); IND-R4's two remaining shapes recorded at their gates.
284. Tier-4 sweep closed; **the manager/vehicle DESIGN assigned** (ETF template: vehicle keeps the entity, manager keeps the shell + `managesEntityIds`, the fee becomes a real payment; step order fixed); logistics scale measurement-gated; 20-week combined probe 6/4, all dust.
285. The boundary burndown measured first — 60% of 'non-auction operating receipts' was the four INSURERS' shells collecting from the boundary what their entities had already been paid (a growth loop: the double-collected cash fed the premium capacity); fixed via vehicle settlement; an operating firm's accrual remainder moves NO cash (settle:false never moved real money — comp.cash has one mover). The equity residual answered: CCP legs are exact negatives by construction; the leftover is float dust ≤$2k/week.
286. ZERO BOUNDARIES — issuer pays holders directly, capped at its own money (bank issuers EXCLUDED: their paper is the wholesale roll's; paying it here raced the roll and broke five identities); the estate's account IS the debtor's account; receivables are the real invoice book; assets sell to NAMED PEERS; unserved-lane freight pays the origin's transport SME pool. BOUNDARY_FRONTIERS is ONE seed-gated line; everything else fails the week it appears.
287. **THE REBASE: 13 violations / 5 families — the run to judge against** (60wk, seed 2654435769, shocks on, §7.286 tree). The five: USA u band 9x (ends 33.6% — the capex channel is the head of the queue), one w2 shock single, two credit-ETF dust singles, one JPN NIM dip. Boundary silent all 60 weeks; identities green; CPI ×2.024; active firms 2,220 (attrition is REAL now — §1.20); damper 1,640; reconcile meter 2.2B/wk. SEED_BURN_IN, the wholesale re-anchor and COH's 0.42 each stay behind their own recorded gates.
288. **The three standing issues §7.287 ranked, fixed in one pass:** (a) CAPEX — growth capex capped at the money the firm commands (FCF after maintenance + cash above the treasurer's own operating buffer — one owner, rule 19; the first cut's stated 1.5x IG factor was killed the same day on user order); raised money lands as cash and grows next week's cap by exactly what was raised; at w15 all regions bid 0.65–0.67x depreciation. (b) **THE MONEY ROW CLOSED** — RECON_TRACE proved the early-regime gross was the CLAMP CONVENTION (signed truth ⇒ divergence exactly 0.0M/bank/week: the ~25B was the rolling overdraft float the §7.265 facility drains); the 02b reconcile overwrite DELETED — deposits evolve by settlement alone, the meter stays as watchdog; SME asserts at region level; defaulted firms are IN the truth (§7.286 made the estate account real). (c) THE DAMPER decomposed by book (`book:id` tags): equity 771 / stock loan 283 / corp bond 229 / CP 83 / lev loan 77 at 12wk — half is the small-cap equity tail (SCALE's), sovereign is 2 bills. A decomposition to burn down by named class, not a scalar to watch. 60-week reference on this tree: §7.289.
289. **THE REFERENCE ON THE §7.288 TREE: 30 violations / 7 FAMILIES — THE RUN TO JUDGE AGAINST** (60wk, seed 2654435769, shocks on). **The capex cap worked at horizon: the u endpoint BENT for the first time since §7.271** — 30.3/28.1/25.4/23.2 (§7.287: 33.6/28.9/26.3/26.3), the USA band family shrinking 9x → 4x (grazes 30.09–30.66 only in the last four weeks — the LAB row at the harness boundary, not a spiral), and the capex battery reads 0.90/0.88/0.88/1.00x of depreciation (§7.287's EUR blowup tree bid 7.5x; JPN at exactly replacement). CPI ×2.189 with w60 inflation 17 annualized; GDP 1.14T; active firms 2,230; carriers 12/12. **The money row's deletion held at full horizon: meter 0.1B gross (watchdog-quiet), boundary ONE declared line ('wholesale funding repaid' −0.2B).** The 30 against §7.287's 13 is the relabel plus two regrown families, both previously named: UK bank NIM 16x (marginal-to-negative, −0.012…0.0096 — §7.261's watch became the top family; §7.254's accretion-blind income measure is the first suspect) and the loan/sov mint drift 6x at 2.0–2.3% over (§7.259's known remainder: claims on issuers that left the book are not swept), plus EUR capital 2x, two ETF dust singles. **The damper decomposition at 60wk: 2,481 persistent binds** (equity 774, corp bond 617, stock loan 472, CP 413, lev loan 121 — the corp-bond/CP tails GROW with horizon where equity is flat; worst streak 60 weeks). Queue set by this run: UK NIM legs → the mint sweep → the damper by class → the band edge.
290. **STRUCT CLOSED AS A PROJECT — the finite remainders executed in five bit-exact commits, the deferrals each pinned to its own recorded rule.** (a) Ten per-kind facts now live on `INSTITUTION_PROFILES` (liabilityDriven, beneficiariesAreHouseholds, sovereignDurationMandate, sovereignCoreShare, preferredCreditDurationYears, subInvestmentGradeSizeFactor, sellsCdsProtection joined picksOwnNames/investsInEtfs/leverage) — seven if-chain sites across 07b/07c/07g/07h/fx-hedging/household-balance-sheet/cross-border converted value-identically. (b) The two ANONYMOUS instrument unions got names and all four taxonomies derive from one superset (`ItemizedHoldingType`/`EstateClaimType`/`PrimaryOfferingType` as Exclude/Extract views of `HoldingType`) — a new kind must be placed in or excluded from each view deliberately. (c) Two holding facts joined the asset registry (`hedgedAsFixedIncome` — CP excluded, 13-week paper's FX exposure dies with the paper; `carriesRateDuration` — a leveraged loan floats), ratchet 58 → 56. (d) The `Account` end-state noun is STATED in the ledger; assignment-form money-write ratchet 3 → 2 (the survivors: a stock-transfer absorb and a derived view). (e) The employer's weekly labor decision (quit-rate concavity §7.210, the own-price deflators §7.149/249, the demand pull §7.247, the posting precedence §7.269) and the bank's credit pricing (the G2 transmission's quote arithmetic; CREDIT_RECOVERY_RATE got ONE owner) extracted to `domain/` — **FP bit-identical both times**, tests 72 → 86, lint ceiling 386 → 385. DEFERRED with reasons in §5: the Money brand (seam rule — lands with the columnar journal), the nominal BankBook split (the readonly view closed the measured class), the details-bag union (all 30 consumers are UI components AU deletes). The step-2 loop survives as STANDING discipline, not a work item.
291. **THE UK NIM FAMILY WAS §7.268's DEFECT ONE FUNCTION OVER — the PD that PRICES a bank's paper still read the corporate context.** NIM_TRACE named the carrier in one run: THSY, NIM −25%, paying 386M/week on a 27B wholesale stack — ~74% ANNUAL. The chain: `computeAnnualDefaultProbability` read `comp.cash` (~0 for a bank — its money is `cashReservesUSD`) and the swinging accrual-bridge `ebitda`, so `shockToCash` collapsed, the structural distance went to ~0, 07b priced the bank's own bonds toward default, the cleared OAS repriced its wholesale (G3c reads it) from policy+130bp to ~74% between w10 and w31, and a solvent bank was eaten by its own mispriced funding — the §7.268 rating fix had left the PD untouched. **Fix: a bank's default distance comes off its OWN sheet** — what a bank defaults on is CAPITAL, so distance = (equity − RWA × BANK_MIN_CAPITAL_RATIO) / (RWA × its book's own measured provision rate): every input measured, no new constant, a bank AT the floor prices at PD ~0.5 (which is what a bank at the floor is). `bankRwaUSD` moved to `domain/bank-pricing.ts` with the other capital rules. **Validated, 56 weeks shocks-on: UK NIM 16x → 1x (one 0.0088 dip), the USA u-band family 4x → 0 (endpoint 29.3, never crossing 30), 7 violations in 6 families — the best world in the model's history.** A relabel (every bank's OAS moves from w1); the fresh reference read is §7.292's to strike. Also seen and kept for the sweep: THSY remains structurally marginal (27B wholesale at ~11%, NIM 0.1–0.7%) — real thinness, not a mispricing; and the repo/SRF collateral gate leaves a reserves-short bank with no lender once unencumbered securities run out (THSY's cash printed −1.3B in w13 with no window to draw) — a missing LOLR mechanism, recorded not chased.
292. **THE MINT-DRIFT QUEUE ITEM DISSOLVES UNDER ITS OWN INSTRUMENT — most of the "excess" was the instrument's classification error, and what is real is the cash cap working as designed.** The first MINT_TRACE keyed holdings by COMPANY ID alone; every debt class shares that id as its instrumentId, so it summed bonds+loans+CP against a one-class outstanding and reported 5–13B of phantom per-issuer "excess" (§7.221's classification-is-not-measurement, committed by the measuring instrument itself; a per-stage tracer walked the whole week and found holder totals tracking outstanding within trading noise). Fixed: the trace keys by (issuer, class). What is REAL: (a) the loan-class drift is the §7.259 cash cap doing exactly its documented job — PAYDOWN_TRACE showed issuers with held > outstanding and NEGATIVE cash (JTLN 10.5B held / 8.6B out / −8.2B cash): a borrower that cannot pay keeps owing, and the claim persists until money exists, which is honest, not minted; (b) at reference scale the class families are two ~2.1% singles (UK sovereign, EUR loans) hovering at the check's own 2% tolerance — watch, not work. Instruments kept: MINT_TRACE (class-keyed, with top-holder decomposition), MINT_STAGE_TRACE (per-stage holder-total mover), PAYDOWN_TRACE (the paydown's own skip reasons). The lesson, again and sharper: **when a trace instrument reports something astonishing, verify the INSTRUMENT before the ledger — the first version of the §7.18 probe, the L7 clamp, and this one all lied in the direction that made a story.**
293. **THE REFERENCE ON THE §7.291 TREE: 15 violations / 8 FAMILIES — THE RUN TO JUDGE AGAINST** (60wk, seed 2654435769, shocks on). The §7.291 PD fix at full horizon: UK NIM and UK capital families GONE (16x → 0); the bank watch migrated to EUR exactly as §7.254 predicted when EUR got its band (EUR NIM 3x, EUR capital 2x — the next cohort read); USA u-band 2x (31.1 in the last two weeks; endpoint 31.1/28.4/25.4/22.7); EUR lev-loan drift 3x (~2.1%, the §7.292 watch); the two credit-ETF dust singles; one −0.00B 'term-out' boundary rounding single. **Capex/depreciation 0.90/1.00/0.90/0.91 — EUR at exactly replacement**; meter 0.1B; boundary one line at −0.0B; carriers 12/12, tonne-miles 4.05e9.
294. **SEED_BURN_IN EVALUATED AND REJECTED ON ITS OWN MEASUREMENT — the burnt world is WORSE: 99 violations against 15.** A 12-week burn (60wk shocks-on, same seed) bakes the engine's own opening TRANSIENT into week 0 — u opens ~19% and ends 33.1/30.4/28.8/24.1; the UK bank families return (NIM 23x, capital 20x: the §7.291-era wholesale drift's early trajectory becomes the OPENING state); USA sovereign mint 5x — and adds a burn-in artifact of its own: `currentWeek: 0` resets the calendar while the policy-meeting phase carried on, printing 'policy rate changed on non-meeting week' 4x. §7.232's gate was right for a deeper reason than its table: the seed's asserted world is in several ways SANER than any week of the engine's opening transient, so burning in moves the start INTO the swamp, not past it. **The gate stands closed on measurement, not preference; the wholesale-claim re-anchor and COH's 0.42 therefore proceed (when queued) as DIRECT seed re-anchors, not via burn-in.**
295. **MNC BUILT — a subsidiary IS a company, and the pipeline's first build-table item lands on the fewest primitives.** Per the §5 design: (1) `parentTicker` + `founderPct: 0` is the whole ownership structure — the household private-business residual excludes a parent-held firm by the same subtraction that defines it (OWN4), and consolidation is a view, never a second set of books. (2) The FDI decision reads the sourcing intent's OWN merit order (`expectedLandedCostByOrigin` — the exact number B's buyers decide with): a firm whose home-landed cost loses to B's local producers for the §7.138 measured year (counter reset on any winning week) builds in B on the quarterly clock. (3) The birth goes through the ONE birth machinery, sized at the parent's measured export flow into B (B's intended units from A × landed cost × the line's category share, ×52), the parent's own margin, ZERO leverage — and the parent PAYS the opening balance cross-border from its deployable cash above the treasurer's buffer (§7.288's discipline: no money, no deal). (4) Repatriation is the SUBSIDIARY'S TREASURY SWEEP: above-buffer excess goes home to the parent as a real payment, because a private sub has no market cap for a declared yield to price and its holder of record IS the parent. (5) NO export-substitution rule — once the sub produces in B the merit order hands it B's demand on landed cost alone: the mechanism that triggered the FDI completes it. Harness diagnostic added (subsidiary census + intra-firm share of cross-border invoices, which must EMERGE toward the real ~one third). Verified: 15-week probe at the 2-violation baseline, mechanism armed and inert (FDI_TRACE w13: 685 firms carry a live disadvantage counter, longest 11wk against the 52 gate; nothing born, nothing relabeled); categories clean. The mechanism's first fires arrive past w52 — the next long reference is its live read.
296. **DYN BUILT — entry follows expected profit, capacity leaves in downturns, and integration follows measured failure.** Three mechanisms, no new constants beyond the model's own structural clocks: (1) **Entry** — the birth machinery's candidate score becomes unserved demand × the pool's OWN measured margin (their product needs no coefficient): entrants go where entering PAYS, which is what makes category margins mean-revert through entry instead of by assertion. (2) **Mothball / restart / scrap** (`capacityRetirement`, a pure §5-STRUCT-shaped rule in `domain/company-week/capital-programme.ts`): the §7.139 produce/idle FLOW response gets its STOCK half — a quarter of sustained idling takes the persistently-idle share offline (no maintenance draw, no staffed capacity — stage 05 shaves `normalSeasonUnits` by the mothballed share, so retired capacity's ABSENCE is visible in supply); the same 10%/week stock-adjustment weight (§7.288's convention) brings it back when the plant covers cost again; a §7.138 year mothballed is SCRAPPED — gross PP&E and its share of accumulated depreciation leave together. Stage 05 measures the idle share where the test runs and nowhere else (rule 3, via `CompanyWeekUpdate.idleLineRevenueShare`); stage 08 integrates it. Closes §7.246's standing watch ("a sector now OVERSUPPLIED will idle capacity and the model has no mothball/scrap mechanism — DYN's charter"). (3) **Structure as strategy** — a vertical branch in `checkForMerger`: an acquirer whose volume-weighted supplier reliability for an input reads below 0.5 (the definitional midpoint of IND14's own [0,1] record, whose 0.9 EMA is a year-scale memory by construction) acquires the most reliable same-region producer of that input it can afford — the same M&A machinery, aimed by the measured delivery record. §7.240's dead-open `cash < 500` guard (dollars against books in billions) deleted rather than rescaled. NOT taken: the `NAMED_TIER_REVENUE_SHARE` cut-point fold (a seed re-anchor — parked with the other §7.294-cleared direct re-anchors). DECLARED RELABEL: the entry scoring changes the first quarterly birth and the vertical branch draws from the stream. 16-week probe at the 2-violation baseline; mothball/scrap arm on their own clocks (13/52 weeks).
297. **PROD BUILT — productivity is LEARNED, not stated: Wright's law at the firm, and the stated aggregate drift dies.** `LABOR_PRODUCTIVITY_GROWTH_ANNUAL = 0.012` was a uniform exogenous drift every firm received identically — the §1.19 shape parameter standing in for the missing mechanism. The mechanism: unit-labour requirements fall by `LEARNING_ELASTICITY = 0.2` per DOUBLING of the firm's own cumulative output (a TECHNOLOGY primitive — rule 4 admits it; the canonical middle of the measured 0.1–0.3 range) — replacing the shape parameter one-for-one on the scoreboard. Stage 05 measures units STARTED where production is decided (rule 3); the consumers are the three places productivity already acted: labour demand nets out the firm's OWN learning, `fullStaffingCapHeads` divides by the multiplier, the level target's revenue-per-head learns with it. **The seed anchor is DERIVED** (§7.4): a firm opens at the cumulative experience where its curve reproduces the legacy drift for its current run-rate — the world opens growing exactly as it used to and diverges by experience alone; the 0.012 survives only inside that anchor and as the pools' convention. This is §5-PROD's stated growth engine: dispersion (a fast grower doubles sooner), reallocation (IND6 hands share to the productive), cycles reaching the trend (a depression halves learning — 'cutting all R&D flattens growth' with production experience as the R&D). DEFERRED with reasons: deliberate R&D SPEND and PRODUCT innovation (a runtime registry line's physics/BOM/demand weights cannot be conjured honestly by a draw; §7.243's seed-mass guard is armed for that arrival). 5 tests pin the curve (the anchor reproduces the drift to 1e-4; a doubling yields exactly 2^ε; zero production = zero learning). 16-week probe at the 2-violation baseline; a small declared relabel.
298. **CRE BUILT — one registry entry, and the machinery the model already owns does the rest: rule 17 at full scale.** `commercial_rental_services` (IN_PLACE, SUBSCRIPTION, buyer mix 92% corporate / 8% government) joins `RealEstateConstruction`: landlords are DEALT as ordinary producers plus the industry's 0.78 SME pool (the small-landlord tier — §7.229's "a new profile has no small-firm tier" closed for this one by riding an existing industry); their buildings arrive as CAPEX through the commercial_construction market; **a LEASE is a SUBSCRIPTION** — IND2's contracted base survives a week with no new lettings and decays by churn, which is what a lease IS — struck through the same contract machinery as every supply relationship; **VACANCY is the book's unsold capacity**, priced by the same auction; a landlord that cannot cover unit cost idles (§7.139), mothballs and scraps (§5-DYN); and the CRE lending channel is its facilities and bonds on named banks' books, so vacancy → landlord default → bank capital is the EXISTING estate machinery with nothing new to teach it. Measured at week 3: 150 dealt producers across regions, the market clears tight (2,410 supplied / 3,983 demanded), rents flow. THE HONEST LIMIT, recorded on the entry itself: the market's VALUE scale is pinned by the demand-level identity (C+G, §7.272), so a 92%-corporate service seeds at its government slice — the same structural under-sizing every corporate-heavy service rides (logistics at 0.08% of GDP against a real 5–6% is the named specimen). That is §6.1's level row, not this entry's: the mechanism is complete at whatever scale the level hands it. The REIT financial-wrapper profile stays a declared null (landlords-as-operators is the honest core; the listed wrapper is a later slice). DECLARED RESEED RELABEL: a new dealt line changes the seed. 16-week probe: 3 violations (the two credit-ETF dust singles plus one USAEQX dust single the reseed shuffled back), world in family.
299. **TAXR BUILT — the corporate tax base is REAL: accelerated depreciation, loss carryforwards, and a rate a legislature actually set.** Three POLICY features (rule 19's admissible class), one function (`corporateTax` in the firm's own income statement): (1) **Double-declining tax depreciation** — 2/usefulLife on the plant's TAX basis while the book runs straight-line; the depreciation swap (`taxable = preTax + bookDA − taxDep`) is what makes buying plant shield near-term profit, so tax reaches the investment-timing decision; `(book net PP&E − tax basis) × rate` is the deferred tax liability, a derived VIEW with no flow. The basis grows by plant ENTERING SERVICE — the construction queue is read ONCE, above the statement, and the same commissioning number feeds the tax basis and the book. (2) **Loss carryforwards** — a loss is neither taxed nor rebated (§7.255's rule, unchanged); it accrues a carryforward that offsets FUTURE taxable profit, so receipts fall faster than profits in a downturn and a recovering firm pays nothing until its loss history is spent. The old `EBIT > 0` gate dies with its rebate corner (positive EBIT, negative pre-tax used to get `preTax × (1 − rate)`). **One rule the build nearly got wrong: the attributes are STOCKS and the statement is a year-RATE called weekly** — `corporateTax` advances carryforward and basis by one week's slice per call while returning annualized P&L lines; at the annual rate every week they would have moved 52× too fast (the same stock/flow discipline as the PP&E roll-forward, caught before it ran). (3) **The accrual IS the statement's tax line** (rule 14): stage 08's weekly cash accrual was still recomputing `max(0, EBIT − interest) × rate` next to the new statement — the old gate surviving in the cash walk — replaced by `taxPaidAnnualUSD / 52`, so carryforwards and acceleration now reach the dollars the treasury receives, which is the point of them. (4) **`CORPORATE_TAX_RATE_BY_REGION`** (USA 0.26 / EUR 0.28 / UK 0.25 / JPN 0.30 — combined statutory national+local rates) seeds `region.effectiveTaxRate`, which each region's own fiscal stance then drifts; both bootstrap net-income seeds open at their region's rate (the §6.1 "generated at 21% into a 31% world" mispricing, kept dead); `EFFECTIVE_TAX_RATE = 0.31` survives ONLY as the seed's total-revenue share of GDP (all bases, week-0 fiscal close). The differential is real policy variation MNC subsidiaries now face — a sub is taxed where it is BOOKED (its own region's rate through the one statement every firm runs); transfer pricing on intra-firm invoices is DEFERRED with reason: the intra-firm trade share is still emerging (§7.295) and a pricing rule without measured flows to misprice is a knob. Attributes seed at book net PP&E on first touch (§7.4: no opening deferral — the world ACCUMULATES its deferred stock from week 0); scrap (§5-DYN) does not yet write the tax basis down with the book — an accepted simplification recorded here, material only if scrapping becomes material. 6 new tests pin the base (weekly slice, shield exhaustion order, cyclical asymmetry — half the profit, none of the tax; acceleration's deferral arithmetic; the dead rebate corner; both paths carrying attributes). Harness diagnostic added (§5-TAXR block). **Measured, 16-week probe (SHOCKS=0, harness green): 719 of 2,437 firms already carry a carryforward, 3.1B total; tax basis 1,375.1B vs book net 1,386.3B; deferred liability 3.7B** — dispersion, deferral and the receipts asymmetry all live within one quarter. DECLARED RELABEL: every firm's net income, EPS and tax cash move from week 1 (no RNG draw added). Also fixed riding along: two stray lint ERRORS in `learning.test.ts` that slipped through §7.297's `;`-chained commit (the `&&` lesson, again). Ladder: tsc, 98 tests, hygiene, lint 382/382.
300. **SCALE Wave 2, the profile-guided round: 1,817 → 1,583 ms/week (−13%), every change bit-exact, and §7.220's diagnosis confirmed at line level.** Method per the design: profile FIRST (V8 CPU profile, source-mapped to real lines via an esbuild bundle — tsx's transform hides positions), then convert only what the measurement names, each conversion FP-gated (`FP_WEEKS` knob added so a fingerprint can cross a quarterly clock). Four converted walks, all order-preserving so the floats are identical: (a) estate-resolution filtered the ~170k-invoice book PER OPEN ESTATE for its receivables — one grouped pass, 171 → 56 ms/wk; (b) the §5-DYN vertical-integration scan walked all relationships per acquirer — the per-(customer,input) reliability precomputed in one pass, the quarterly spike 349 → 55 ms; (c) the §7.282 fx-fee leg filtered all ~2,500 firms PER CROSS-BORDER INVOICE for the buyer region's banks — memoised on the firm array's identity; (d) the holder-interest accrual collected ~40k `{entityId,key,qtyUSD}` row objects per call — two passes over the same typed columns in the same order, per-instrument state in dense intern-id arrays, no row objects and no per-row key strings. **Verified three ways: FP bit-identical through week 14 (crossing the quarterly firings) after every change; SHARDS=1 ≡ SHARDS=8 (the kernel-combine invariant); and the post-round hashes equal the PRE-round baseline** — the whole round is a pure relabel of nothing. Where the time now is, against §7.222's targets: stage 05 477 ms (INSIDE its recorded 370–490 serial band — the wallet-shared market loop is at its honest floor), stage 08 409 ms (~168 µs/company against the 78 µs columnar floor — the remaining gap IS phase 3, the per-company closure's own object churn: no O(world) scan survives in it), GC 7.8%, and the rest a long tail of 5–15 ms/wk stages exactly as §7.220 measured ("no dominant block"). What stands for the wave: phase 3's companies-as-columns (the 08 gap), phase 5's worker pool (blocked on the stages still reading the object graph), and the damper's small-cap equity float half — none of it blocking the pipeline's S-final, all of it measurement-gated as before.
301. **THE FIRST FULL-PIPELINE REFERENCE FOUND A THREE-DEFECT REGRESSION; THE BISECTION NAMED ALL THREE; AND THE FIXED TREE IS THE FIRST IN THE MODEL'S HISTORY WHERE THE u ENDPOINT BENDS DOWN AT HORIZON.** The 80-week shocks-on reference on the post-TAXR tree came back 295 violations / 17 families (u 39/43/35/35 at w80, EUR banks dead from w29, 10Y 7.9, three settlement/CB identity singles past w60) against §7.293's 15/8 — and the whole regression was worked by measurement, one commit and one hunk at a time. **The commit bisection (30wk shocks-on, same seed, worktrees):** §7.293 tree 26.0 USA at w30 (4 viols) → MNC 26.0 EXACTLY (armed and inert, as designed) → DYN 26.6 (+0.6, its declared relabel) → PROD 30.4 (+3.8) → CRE 30.9 → TAXR biggest on EUR (+4.3 at w30, compounding at horizon). **Inside PROD** (hunk-by-hunk on the worktree): the netting (a firm's OWN learning in place of the drift) is CLEAN; the staffing-cap ÷ learning is +0.6; **the LEVEL TARGET × multiplier alone is +3.6 — a THRESHOLD RATCHET**: §7.247's override rescues a firm only while `outputNeedHeads` exceeds its books, so even the clean ~0.5%/yr multiplier shaved marginal firms out of the rescue weekly and released exactly the layoffs the override exists to veto. FIXED: the level target does not learn (both sides of its ratio at the baseline vintage; learning reaches labour demand through the netting and the ceiling — the double-count was the defect). Also fixed on the way, each principled and kept: the learning SEED anchors on the plant's capacity rate, not the first produced week annualized (an under-seeded curve read recovery as years of learning; LEARN_TRACE now shows p50 1.1%/yr, max 1.8%); the mothball unit-cost test runs at NORMAL staffed volume (§1.9 — the mothball moves capacity, it must not decide solvency) and the staffing CEILING scales by the online share (the §7.296 record's "no staffed capacity", previously unimplemented); the capacity read no longer re-multiplies the CURRENT revenue share against an anchor struck at the OPENING share (rule 9 — measured a no-op today because line shares are static, kept as the form that matches §7.177's own comment); the contract non-delivery output throttle applies only to RECIPE inputs (measured no-op, kept as the rule). **CRE:** the live rental market alone carried +4.8pts USA u and +32 CPI points by w30 (CRE_OFF split: the reseed costs ~+0.4, the LIVE market the rest; CRE_SUPPLY_X=2 recovered −2.8). The shortage is NOT the stated intensity's (400→280 moved BOTH sides — supply derives from the same demand-level identity; the ~0.74 opening fill is §6.1's seed-level row and INVARIANT here) — it is a §7.245-family service spiral: near-inelastic corporate premises demand against supply that is buildings, leaking through the shared industry's wage/revenue signals into the housing categories households do buy. **THE CRE MARKET IS GATED on that measurement** (the §7.294 pattern), landlords and registry entry intact, reopening condition named on the gate: the §6.1 level-row decision re-sizes the market, or premises demand gets a real elasticity; `CRE_MARKET_LIVE=1` re-measures. **TAXR:** the real base collects 27–33% less corporate tax than the flat accrual (measured w5–6 like-for-like via FISCAL_TRACE; the shield and carryforwards dominate, the statutory cuts are minor), corporate is ~12% of the budget, and the seed's fiscal close was still struck at 0.31 — a budget opening ~3.6% above sustainable revenue in every region, compounding into the measured w45+ sovereign blowout (10Y 4.7 → 12.9). FIXED per §7.4: `EFFECTIVE_TAX_RATE` (the seed's total-revenue share) re-struck at 0.2988. **The chain, measured at each step: 295/17 (80wk) → 185/15 → 139/13 → 94/13 → 57/9 (60wk, the new tree)** — and the last run is qualitatively different: 10Y anchored 4.69–4.73 for sixty weeks, GDP 1.14T, and **USA u 30.6 at w30 → 26.9 at w60, falling through the back half** (§7.293 ended 31.1 rising; §6.1's capex-channel row finally answers "does the endpoint bend" with yes). What remains, named: UK NIM 27x + JPN NIM 14x (the §7.254/§7.291 bank-cohort watch, migrated again — next cohort read), USA u 7x transient crossings of the 30 band in the mid-run hump (not a ratchet — it recovers), JPN u 3x (ends 30.1 — the one still-rising region), lev-loan/sov mint dust singles, and the two small-cap ETF singles. Not chased: the three identity singles from the 80-week run (unresolved settlement ±0.013B paired with CB non-netting at w64/65/77 — reproduced, all-branch UNRESOLVED_TRACE armed, and on the fixed tree the EUR bank cohort that likely carried them no longer dies; re-check on the next 80-week read). Instruments added and kept: LEARN_TRACE, CAT_TRACE=<unit>, FISCAL_TRACE, UNRESOLVED_TRACE, CRE_SUPPLY_X / DYN_MOTHBALL_OFF (attribution probes), FP_WEEKS. THE LESSON, at full price: **five relabels landed between two references, and the regression cost six times the tokens the builds did to attribute — strike a shocks-on horizon reference after EVERY build that touches labour, prices or the fisc, not after five.**
