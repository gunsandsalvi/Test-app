# MASTER PLAN — Single Source of Truth

The only planning document in this repository. **§1** the standing rules, **§2** the codebase map,
**§3** what is real and what is not, **§4** the work order, **§5** instructions for the OPEN items,
**§6** defects and watchlist, **§7** the record (never renumbered).

**How to work:** take the next unfinished §4 item, read its §5 section, build it, run the §1.10
ladder, commit it as one bounded change naming the item. Never start an item whose prerequisites
are not done. **When an item closes:** its §4 row says so in one line, its §5 section is DELETED,
and the record goes in §7.

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
   observed prices or copied spread tables. **The sharper half:** a real-world *primitive* is fine
   (a tax rate, a replacement rate, a regulatory ratio, a haircut); a real-world *equilibrium* is
   not. Dollar invoicing dominance, a 24% foreign ownership share, a fixed central-bank market
   share are RESULTS of histories this simulation does not have. Import one and the model can
   never tell you anything about it, because you assumed the answer.

5. **Target allocations are long-term policy guides only.** What a participant buys each week is a
   tactical decision from real characteristics, never the target mechanically.

6. **Long tests are end-of-project only.** During development: `npx tsc --noEmit`,
   `bash scripts/check-hygiene.sh`, and short scratchpad probes.

7. **One bounded, verified commit per slice.** Never one large unreviewable change.

8. **Reflect the real-world mechanism.** When in doubt, the answer is how it actually works, with
   real named counterparties. Ask before large scope decisions.

9. **Periodicity is part of the number.** Every rate, growth figure, flow and index carries a
   period, and mixing two silently is one of the most common defects here — a "year-over-year"
   comparison taken 51 weeks apart; a first-year rate that exponentiated one week's by 52; an index
   measuring week-over-week while its consumers read it as a level. **Confirm the period at the
   source and name it in the identifier** (`...WeeklyUSD`, `...Annual`, `...YoY`). Never infer it
   from context. **A price level is part of a number too** (§7.149), and so is a unit of meaning:
   a field named USD is not a share (§7.165). **Displayed values show MoM and YoY**; where there is
   not enough history, show the level — a missing change is information, a fabricated one is a lie.

10. **The simulation is a partial world — do not chase every moved number.** Whole systems are
    still missing, so counts shift for non-economic reasons. Attribute a moved baseline BRIEFLY
    (one cheap A/B at most), record it with its owner, and move on.

11. **Brevity in comments and in this file.** A comment earns its place by saying what the code
    cannot: why a constant has its value, what a non-obvious mechanism is, what was tried and
    failed. It does not narrate the code or tell the story of how the change was found. **Clean up
    as you go.** Same for this document: every record is the finding, the number and the lesson.
    No information is dropped; the narrative is.

12. **Do not evaluate market behaviour mid-update.** BUILD THE WHOLE THING before measuring.
    Numbers taken halfway through describe an economy that does not exist yet. **Measure once, at
    the end.** The narrow exceptions are structural, not behavioural: `tsc`/`build` to confirm it
    compiles, and a targeted probe that a mechanism you JUST wrote is wired. **The harness may be
    deliberately red mid-project.**

13. **Ownership, prices, quantities and capacities are OUTCOMES.** Never impose a share, a price, a
    flow or a capacity a mechanism should produce. **A residual with no holder is a defect, not a
    boundary** — a named gap is legitimate only with a size, an owner and a scheduled closing
    slice; otherwise it is a plug with paperwork.

14. **Every flow has two sides, and both legs go in the same pass.** A security movement has a cash
    leg; a derivative has a counterparty with finite capacity; a payment leaving one book arrives
    on another. **A one-sided flow is a defect even when nothing fails and every test passes.**
    Building a two-sided flow one side at a time is how a leg goes missing.

15. **A bound is not a price.** All markets clear through `stages/financial-clearing-engine.ts`: a
    participant posts a reservation level, a `fullSizeStatRange`, a `maxHoldingUSD`, a
    `maxNetPurchaseUSD` and a `minHoldingUSD`, and the solve clears at the **saturation point** if
    demand cannot absorb the float. Never park a print on a clamp and call it a price. Recorded
    four times (§7.21, §7.75, §7.130, §7.132); the subtlest form is a bound that LOOKS like dollars
    and is a percentage wearing dollars' clothes.

16. **Delivery.** One bounded commit per slice, pushed. Commit messages and §7 records state what
    changed, WHY, and the measured numbers, for a reader who was not here. **No model identifiers
    in any committed artifact.** Do not open a PR unless asked.

17. **The targeted-change test.** Adding a product line, a lead time, a revenue rule or a fund type
    must be ONE targeted change: a registry entry, or one profile module. All DATA about what is
    made or who is acting lives in a registry; all BEHAVIOR that varies by kind lives in a profile
    behind a dispatch table. **A stage may not switch on an industry, sector or entity type — it
    asks the registry or calls the profile.**

18. **Model updates come first; a misbehaving NUMBER is not a work item.** The priority is always
    the missing MECHANISM. **Scoping a project around closing a number is how a model gets tuned
    instead of built.** Rule 10 says do not chase a MOVED number; rule 12 says do not MEASURE
    mid-project; rule 18 says do not SCHEDULE around a number at all.
    - **The evidence (§7.146-163):** ten IND slices and three root-cause fixes moved the week-10
      price print −25.5% → +4.3% without any of them targeting it, and the largest single move came
      from a UNIT ERROR in the labour stage.
    - **A row whose content is "this number is wrong" is a CONSEQUENCE row**, and its evidence must
      be re-measured before it is scoped — never inherited.
    - **THE OTHER HALF (§7.179):** when a number is so far out that it BLOCKS unrelated mechanism
      work, closing the gap IS mechanism work. The answer is never to widen the band (rule 2) or to
      stop making correct changes — it is to find which MISSING MECHANISM the number is the
      accumulated cost of, and build that.

19. **THE FEWEST PRIMITIVES THAT GENERATE THE WORLD.** (The most basic rule; 1, 4 and 13 are
    corollaries.) A number is a legitimate primitive **only if no mechanism in the model can produce
    it**, which leaves three kinds: **TECHNOLOGY** (what a process physically takes),
    **PREFERENCE** (how an agent trades present against future, and its risk aversion), and
    **POLICY** (what an institution chooses). Everything else is an OUTCOME, and a stated value for
    it is a defect with a scheduled death.
    - **Three kinds of number get confused.** **RESOLUTION** parameters (strata count, grid size)
      are numerical choices; the test is INVARIANCE. **SHAPE** parameters (a Pareto alpha, tier
      shares, an MPC ladder, an average LTV) are claims about THE ANSWER, and every one is a place
      the model cannot surprise you. **TRUE** primitives are the three kinds above, and there
      should be very few.
    - **The count of stated shape parameters measures how much mechanism is missing.** Keep it
      falling; it may never rise. §5-DIST-P holds the scoreboard.
    - **Where an aggregate sits far from a threshold its own mechanism turns on, that mechanism is
      SWITCHED OFF and a constant is standing in for it.** Before believing a mechanism exists,
      print the number and check it can bind.
    - **The corollary that costs most to forget:** a shape parameter STANDS IN FOR a missing
      mechanism, so deleting it before the mechanism exists makes the model wrong, not more
      bottom-up (§7.158, §7.177). The order is forced.

1.20 **NEVER ROLL BACK.** When a change makes a print worse, the answer is never to put the old
    number back. A derivation that replaced an invented constant does not become wrong because the
    world it now describes is uglier — the ugliness was there, and the constant was covering it.
    §7.209 is the case that named this rule: COH4's ladder posts the households' own MEASURED
    reservation, the goods market cannot supply the registry's own stated per-capita want, and the
    price level says so. Reverting the ladder would restore a quiet CPI and a hidden shortage,
    which is the same trade the deleted clamps used to make.
    - **A bad print is a finding, not a regression.** Record it, own it, and work the mechanism it
      exposed. The only thing that may be undone is a change that is WRONG on its own terms — a
      ratchet, a resolution artefact, a broken identity — and that is a fix, not a rollback.
    - **This binds hardest exactly where the temptation is strongest**: at the end of a project,
      when one number is embarrassing and the old constant is one line away.

### 1.10 Verification ladder

| Command | Cost | When |
|---|---|---|
| `UNIVERSE_SCALE=0.12 … npx tsx scripts/harness.ts` | ~205 ms/wk | iteration: the conserving roster (§7.214). **Never a validation run** |
| `npx tsc --noEmit`, `npm run build` | seconds | any time, always before a commit |
| `bash scripts/check-hygiene.sh` | seconds | any time; fails if a second script appears |
| `WEEKS=10 SHOCKS=0 npx tsx scripts/harness.ts` | ~40 s | structural probe: is the mechanism wired |
| `npm run verify` (243 weeks incl. shock batteries) | ~5 min | **END OF PROJECT ONLY** (rule 12) |

`NODE_OPTIONS=--max-semi-space-size=64` is worth 7.5% on any of these — the engine is
allocation-bound (§7.213) — and is wired into `npm run verify` and `npm run profile`.

**A 10-week probe samples ONE SEASON** since IND18, so its price print is a seasonal reading, not
a steady state. Price behaviour is judged on whole years.

---
## 2. Codebase map

### 2.1 The weekly pipeline (`src/engine/simulation/`)

`core.ts` builds a `WeeklyStepContext` (`stages/context.ts` — one shared mutable context, so every
cross-stage dependency is visible) and runs the stages in order. Groups, not a line each:

| Group | Stages | Owns |
|---|---|---|
| Macro & credit | 01-macro-feedback, 02-region-macro, 02b-bank-diversification, labor-market, prime-brokerage | Contagion signals; region evolution and the administered policy rate (**no curve**); per-bank flow ledgers, the GC repo session, the deposit-vs-MMF split; the labour market; the funds' broker lines |
| Real economy | 03-category-demand, 04-input-output, trade-settlement, goods-arrival, sourcing-intent, freight-clearing, 05-unit-bidding, 06-fx-and-trade, 07-commodities | C+I+G plus the Leontief intermediate half; input clearing; invoices due; arrivals; sourcing and freight; **THE goods auction** (five books per sub-unit, per-lot settlement, contracts, capex bids, the distribution channel); FX conversion; commodity spot |
| Financial books | 07b corp bonds, 07c sovereigns (**the curve's only owner**), 07d loans, 07f bills+CP, securities-lending, 07e equity, 07g swaps, 07h CDS, 07i commodity futures | Each a thin adapter over the clearing engine |
| Settle & report | repo-collateral-reconcile, holdings-writeback, institutional-marking, 08-company-fundamentals, hc-lifecycle, settlement, sme-pools, 09-concentration-risk, 10-mergers, sovereign-calendar, 11-fiscal, etf-flows, fx-hedging, 12-portfolio, 13-news | Per-company week; the corporate lifecycle; **the settlement layer (two cycles: intraday and close)**; the SME pools' week; trade concentration; M&A; **the sovereign coupon calendar (§7.208 — one party-keyed ledger, the single writer of the receivable on both books)**; measured GDP and CPI, government issuance; ETF flows and the share book; FX hedging incl. corporates; marks and the turn summary |

**`stages/financial-clearing-engine.ts`** — the generic cap-free double auction. Each participant
posts a real demand schedule; the solve is an exact piecewise-linear segment walk with **saturation
clearing**. `statKind` orients it (`YIELD_LIKE` demand rises with the stat, `PRICE_LIKE` falls).
Packed into flat typed arrays and shardable across a worker pool, byte-identical to serial.
**Every asset class is a thin adapter.** Adapters own who the participants are, each one's
reservation and size, and the float. **`unsoldStaysWithHolder` rations BOTH sides** — the stock
books use it; the flow books keep a dealer residual because their float is a real outside order.
**Read §7.16 and §7.21 before changing this file.**

Other engine files: `initialization.ts` (must seed the shape the weekly engine produces — §7.4),
`shared-helpers.ts`, `equity-valuation.ts` (the ONE answer to what a share is worth), `credit.ts`,
`merger.ts`, `trade.ts`, `constants.ts`.

### 2.2 Engine support (`src/engine/`)

`companyGenerator.ts`, `pricing.ts` (closed-form pricers, display/derivation only), `nelsonSiegel.ts`,
`blackScholes.ts`, `rng.ts` (**all engine draws; the seed and stream position live on GameState**),
`newsGenerator.ts`, `formatters.ts`, `macro/` (initialization, evolution, banking, indices, weather),
`bootstrap/` (population, labor-and-wages, firms, category-demand, commodities-and-fx, yield-curves,
carriers — all generated from primitives).

### 2.3 Domain (`src/domain/`)

The registry is the single data owner (rule 17): `industry-registry.ts` (sub-unit specs — physics,
buyer mix, recipe BOM, seasonality, financing profile, consumption intensity) with `industry.ts`,
`market-microstructure.ts`, `goods-physical.ts` and `instruments.ts` as derived views.
Instruments and books: `banking.ts`, `company.ts`, `institutions.ts`, `primary-market.ts`,
`call-protection.ts`, `repo.ts`, `swaps.ts`, `credit-default-swap.ts`, `securities-lending.ts`,
`commodity-futures.ts`, `commercial-paper.ts`, `prime-brokerage.ts`, `dealer-desk.ts`,
`dealer-derivatives.ts`, `etf.ts`, `indexes.ts`, `distribution.ts`, `volatility.ts`.
Trade and FX: `global-goods.ts`, `trade-invoice.ts`, `invoice-currency.ts`, `cross-border.ts`,
`fx-market.ts`, `fx-hedging.ts`, `currency.ts`, `carrier.ts`.
Households and the state: `region-macro.ts`, `household-credit.ts`, `estate.ts`, `government.ts`,
`central-bank.ts`, `geography.ts`, `game-state.ts`, `defect.ts` (GUARD's loud failures).

### 2.4 UI and the harness

UI reads `GameState` only. **One harness:** `scripts/harness.ts` via `npm run verify` — every check,
battery and the profiler are modules on one simulation pass, one line printed per week.
`check-hygiene.sh` fails if a second script appears. Its checks: NaN purity, ownership and holdings
conservation, per-bank balance-sheet identity, the clearing-house and unresolved residuals, the
**declared boundary frontiers** (anything undeclared fails), NAV identity, damper binding, dead
ceilings, bank capital and NIM bands, unemployment bands, and the shock batteries.

---

## 3. Current state

**Bottom-up today.** Category demand with a real intermediate half → input-output → stage 05's
auctions with named counterparties, per-lot provenance, real settled sales AS revenue, capex as
real bids, a distribution channel priced off the goods' own physics. Commodities from extraction
cost and ore grade. Every financial book clears on one engine: corporate bonds, sovereigns, loans,
bills, commercial paper, equity, securities lending, swaps, CDS, commodity futures, FX, repo, ETF
shares — with the primary market bringing new paper into them and named bank desks as ordinary
participants. Per-bank balance sheets, real central-bank facilities, itemized lending with
endogenous money. Real government issuance against real holders and the remittance loop. Measured
CPI, single-owner sovereign curve, an OIS curve on the cleared repo print. The private lifecycle:
sponsors calling real LP capital, marking at the multiple the public market clears, exiting by
sale. Households at corporate depth — cohorts, a real age structure people age through, balance
sheets that accumulate, a labour market where employment is the sum of what real employers carry.
The SME tier as one pool per (region × industry) with a real cross-section. One settlement layer.
Default resolution with recovery as an outcome.

**Still formula-driven**, each with a §4 owner:
- **The fiscal-stance step function**, which needs a government that reads its own budget (MAC).
- **A profile's stated cost shape** — the insurer's and the card book's remaining ratios (IND-R4).
- **The corporate tax BASE** — a rate on EBIT less interest, with no depreciation shield, no loss
  carry-forward and no deferred tax (TAXR).

**Real but structurally undersupplied.** The clearing markets are honest mechanisms on an asset
universe that does not match the money pointed at it, and the capital-goods sector supplies a
fraction of the capex bid at it. **A correct auction over a short float still gives a wrong price,
and no work inside the auction fixes it.** SCALE grows the universe; the seed fixed point (§7.199)
was the first structural answer.

---
## 4. The work order

The only place a project's order and state live. Work top to bottom; never start an item whose
prerequisites are not done. **Do not reorder without asking** — the sequence encodes prerequisites
not visible from a row: a market cannot be honest before the demand side it prices against is, and
a clamp cannot be deleted before the mechanism under it exists.

### What is left to BUILD

| # | Tier | Project | State |
|---|---|---|---|
| 1 | depth | **MNC — multinational production** | **NOT STARTED.** Prereqs IND and XB, both closed. A firm produces in one region and sells in another as a real thing, not as a trade flow. |
| 2 | depth | **DYN — entry, exit, industry structure** | **NOT STARTED.** Prereqs IND and BP1, both done. Firms are born and die; the named tier's cut point falls out of the Pareto tail instead of sitting beside it. It is also the re-entry mechanism §7.152's supplier-weight floor stands in for. |
| 3 | depth | **PROD — firm productivity and innovation** | **NOT STARTED.** Prereq IND. Productivity as something a firm invests in and gains. |
| 4 | depth | **CRE — commercial property and leases** | **NOT STARTED.** Prereqs HH and G2. Firms rent premises from someone. |
| 5 | depth | **TAXR — corporate tax, really** | **The folded finding closed (§7.206): one owner for the rate.** The row's own substance is untouched — a real tax BASE (depreciation shield, loss carry-forward, deferred tax) and the cross-border half, which needs MNC. |
| 6 | depth | **SCALE — universe scale-up under a wall-clock budget** | **WALL-CLOCK BUDGET MET (§7.214): 205 ms/cycle at UNIVERSE_SCALE=0.12, 391 at 0.25, 1467 at full fidelity (bit-exact).** The roster is a conserving RESOLUTION parameter now — thinning it no longer shrinks the economy, which is the rule-13 defect that had made every previous attempt fail. Wave 2's columnar state is still what a faster FULL-fidelity cycle needs (§7.213). |
| 7 | last | **S-final — the validation gate** | Everything above, plus the measurement debt below. |
| 8 | last | **AU — Aurora, the UI rebuild** | Everything above. UI state moves out of `GameState`, which the determinism hash spans. |

### Named remainders inside closed rows

- **COH — the last slice of `INSTITUTIONAL_OPENING_BOOK_SHARE` (`equity: 0.42`)**, which needs an
  asset manager anchored on the households' own fund holdings.
- **IND-R4** — the profiles' two remaining stated cost ratios.
- **IND7** — the divestiture, which must MINT a holder register; extend the ownership machinery
  first or it undoes OWN7 (§7.138).
- **G2** — a retired bank facility reaches no lender (§6.1).
- **MAC** — the fiscal-stance step function, which needs a government that reads its own budget.

### THE MEASUREMENT DEBT — owed before anything is judged

**Records 200–207 remain UNMEASURED; §7.208 is measured, by §7.209's run.** The gap was not a
deferral — the harness could not start (§7.209), and a red harness is a broken instrument, not a
debt. Everything below still needs its own read. Two of these records relabel the world: NAT's reseed
changed every energy and metal price (§7.193), and HC3b removed an RNG draw per operating firm per
week (§7.207), so **no same-seed comparison across those commits is valid and no number measured
before 2026-08-30 is a baseline.**

Read in this order:
1. **The capital-goods fill rate**, against §7.168's 8% and the per-category table. Everything in
   the foundation tier was waiting on the seed fixed point (§7.199) to move it.
2. **Unemployment**, against the ~29% that has been binding (§7.179). If the fixed point does not
   relieve it from the supply side, that attribution is wrong.
3. **The revenue LEVEL** (§7.207). If firms shrink to what the auction clears, that is either a
   finding about stage 05's demand coverage or about the seed. The boundary's
   `non-auction operating receipts` line is the instrument.
4. **The damper count**, against 947. §7.197 recorded a regression as the honest shape of removing
   the residual dealer: the pressure was always there. **Do not widen the damper.**
5. **The equity market's LEVEL**, which the float change moves by construction (§7.185).
6. **Bank NIM and household interest income**, which G3c's deposit rate can take to zero for a
   liquid bank whose depositors are not leaving.
7. **The price level and the JPN fiscal band**, against NAT's reseed and nothing earlier.
8. **§7.208's four derivations — READ at 12 weeks (§7.209) and 60 (§7.211).** The tier wage multiplier is inert
   at the aggregate, the wage level owns the whole real-side move, the ladder owns the whole price
   move, and CAL's two checks are green every week — over sixty, its payable cross-check trips
   zero times. The long read is IN (§7.211) and items 1-7 above are collectable for the first
   time: the instrument works now.
9. **§5-DER's verify list** — the swap spread and CDS-cash basis in calm weeks and under stress,
   contango when inventories are high and backwardation when scarce, expiry convergence, and
   hedged firms feeling less P&L from the shocks they hedged.
10. **The new books' first prints:** whether any stock borrow clears at all, the borrow-fee
   distribution, whether a recall cascade squeezes or oscillates; whether the ETF premium sits at
   zero in calm weeks; whether the channel margin is a sensible fraction of a shelf price (**it is
   unbounded above by construction** — a long-lead, high-carry good could carry a large one, and
   that is either right or a finding).

### 4.1 Closed projects

One line each; the record is in §7.

| Project | Record | What it left standing |
|---|---|---|
| **L** ledger integrity | §7.46 | Six real defects; a formula masking a defect is the argument for deleting formulas. |
| **HC** hidden corporates | §7.33, §7.41 | ~300 named private firms per region as real `Company` objects — no parallel type. Conservation is the discipline: tier-1 firms are carved OUT of the aggregates, never added on top. |
| **ETF** index funds | §7.44 | 27 funds over 27 indexes; membership and weights are rules over cleared prices. An index fund posts a SIZE with no reservation — the price-insensitive schedule other projects reuse. |
| **HH** households | §7.60 | Households at corporate depth. Making a sector real makes other sectors' defects visible. |
| **PUB** treasury + central bank | §7.68 | Both balance sheets real and the remittance loop closed; the CB places a real open-market ORDER that 07c/07f price. |
| **BP1** registry + rule 17 | §7.83-84 | `INDUSTRY_REGISTRY` as the one data source and `PROFILE_REGISTRY` as the one behaviour dispatch. One entry is one product line, demonstrated end to end. |
| **XB / XB5 / XB6** cross-border | §7.72-77, §7.189 | Ownership is a mandate, not a share; tradability is physics; the FX book auctions the currency being SOLD. |
| **SEG** the SME tier | §7.95-97 | One pool per (region × industry) on the settlement rail. Giving something books is a way of FINDING missing flows. |
| **LAB** labour demand | §6.4 | Seven clamps out; the wage is a price in both directions. |
| **OWN / OWN7 / OWN8** ownership | §7.98, §7.102, §7.104, §7.197 | Ownership is measured off the real books. **A float is what the participants in THIS book hold between them.** The residual dealer is deleted. |
| **FRM** dead formulas | §7.106 | Four deleted, no new mechanism. After closing a project, grep for the number it replaced. |
| **GUARD** loud failures | §7.105 | Five silent defaults throw at the read; three invariants, each of which would have caught a defect found by hand. |
| **IDX** indexes | §7.134 | An index is a statistic with no bound; beta is measured; no published name is a real brand. |
| **CASH / SETL** settlement | §7.87-93, §7.195-197 | Stages record instructions; one stage executes them. Money is a named bank's liability. Two settlement cycles a week. |
| **IND** industry models | §7.146-156, §7.205 | One firm model for every tier; goods have physics, leads, backlogs, seasonality and a distribution channel. **A mechanism that binds on nothing is a mechanism that is not there.** |
| **CHAIN** production depth | §7.117-120 | A BOM is a property of a PRODUCT; intermediate demand exists; the same identity written three times will diverge. |
| **DIST** the distribution is the state | §7.140-145, §7.161-175 | Cross-sections where a decision is nonlinear, with an absorbing barrier and reinjection; nine stated tables became measurements; cut-point invariance is tested with an affine control. |
| **DEM** demography | §7.181 | People age on a Gompertz hazard; the life-cycle savings rate is the retired share. |
| **CAP** capacity | §7.167-168, §7.176-178 | The clamp programme is done; capex anchors to depreciation; capacity reads off PP&E. |
| **COH** cohorts | §7.199 | Spendable and accumulated are two stocks; the pension contribution is the saving households already decided to do. |
| **HSG** housing | §7.159-160, §7.183, §7.200 | The price is what the marginal buyer can pay; the book is vintages with a real fix and reset; every bank quotes its own mortgage. |
| **CRD** credit | §7.162, §7.184, §7.201, §7.205 | Ratings notch off measurements the model already takes; CDS clears; a credit tier inherits the balance sheets in its band. |
| **G3** one dealer system | §7.185-187 | A desk per named bank, an ordinary participant sized by its own capital. |
| **REPO** secured funding | §7.188 | A repo is a contract with two named parties, specific collateral and a term market. |
| **HF** funds + prime brokerage | §7.190, §7.202 | Four strategies, real broker lines that can be withdrawn, and a real equity short. |
| **DER** derivatives | §7.191, §7.201, §7.203 | IRS, the cross-currency basis, CDS, option vol, commodity futures and corporate hedging — all cleared. |
| **G5** default resolution | §7.192, §7.202 | An estate; recovery is an OUTPUT; the capital-recycling loop closes. |
| **NAT** nature | §7.193 | Commodity prices follow extraction cost; weather has a calendar and a generated geography. |
| **ETF2** fund shares | §7.201, §7.205-206 | One budget per investor, in-kind redemption, a derived AP capacity, and a cleared share price with a real premium. |
| **IND16 / HC3b** | §7.205, §7.207 | A distribution channel priced off physics; revenue is what was sold. |

---
## 5. Instructions for the open items

One section per OPEN §4 item, in §4's order. **A closed project has no section here.**

### P1 — Periodicity and units  *(standing)*

Not a phase, a standing sweep alongside whatever is in flight. **Engine:** walk every rate, growth
figure, flow and index and confirm its period at the source; rename where the name is ambiguous
(`governmentSpendingUSD` is weekly and reads annual; `demandLevelUSD` is annual and reads weekly).
Known open: `clearedInputPriceIndex` measures week-over-week but is read as a level versus
baseline; `historicalInflation` and `historicalZeroCurves` lag the measurement stages by a week —
consistent but undocumented at every read site. **Display:** one shared helper in `formatters.ts`,
every changing figure routed through it, MoM and YoY together, the level where history is short,
the period labelled on the figure. Aurora inherits it.

### MNC — Multinational production  *(item 1)*

Every firm is single-region while intra-firm trade is roughly a third of real world trade — here
it is zero. The FDI decision (build abroad vs export, priced off the landed-cost machinery XB3a
already runs); foreign subsidiaries as real plants with local costs and labour; intra-firm trade at
transfer prices; structural FX exposure making the hedging desks' client book real demand; profit
repatriation through the FX books. TAXR's rate differences later make location a priced choice.
**Verify:** FDI responds to landed-cost differentials; an intra-firm trade share EMERGES; one FX
move changes a multinational's consolidated earnings through both channels.

### DYN — Entry, exit, industry structure  *(item 2)*

Concentration as an outcome. **Entry:** sustained high category margins attract entrants through
HC's birth machinery, aimed at the category — and entry is DIST's reinjection at the absorbing
barrier, so the two must not build it twice. **Exit:** sustained losses idle capacity (mothballed,
restartable) then scrap it — the missing half of every capacity cycle. **Structure as strategy:** a
firm repeatedly burned by contract breaks (IND11's measured record) integrates upstream; IND7's
antitrust is this project's regulator. It is also the re-entry mechanism §7.152's supplier-weight
floor stands in for.
**Folded:** `NAMED_TIER_REVENUE_SHARE = 0.6` states a cut point the Pareto tail already decides —
the share and the distribution can disagree. The naming threshold becomes a property OF the
distribution (name every firm above the size where naming matters: syndicated debt, sponsor
interest), and the tail's revenue share is whatever the distribution implies.
**Verify:** category margins mean-revert through entry and exit rather than assertion; capacity
leaves in downturns and its absence is visible in supply; integration follows measured failure.

### PROD — Firm productivity and innovation  *(item 3)*

`rndExpense` buys nothing today. R&D becomes a real investment with uncertain outcomes — process
(unit cost falls) or product (a new line through the registry) — and diffusion erodes any lead:
temporary advantage, never a permanent monopoly (rule 4). Firm-level productivity DISPERSION plus
reallocation of share to the productive through IND6's price competition is the growth engine,
which is what aggregate productivity growth mostly is.
**Verify:** R&D intensity predicts outcomes noisily, not deterministically; aggregate growth
decomposes into within-firm and reallocation terms; cutting all R&D flattens growth over years.

### CRE — Commercial property and leases  *(item 4)*

Firms occupy space nothing produces. Space as a produced long-lived asset (the construction sector
builds it), owned by landlords, rented on multi-year leases that are real tenant liabilities,
financed by CRE loans on named banks' books — the classic systemic channel (vacancy → landlord
default → bank capital) the model cannot express today.
**Verify:** rents clear on vacancy; lease obligations sit on tenant books; a CRE bust marks bank
capital through named loans.

### TAXR — Corporate tax, really  *(item 5)*

A flat rate on (EBIT − interest) prices no decision. Tax depreciation schedules against book (the
investment incentive), loss carryforwards (so receipts fall FASTER than profits in downturns and a
recovering firm pays nothing for years), and — after MNC — profit booked where rates are lower,
which is what makes transfer pricing matter. **The rate now has one owner (§7.206); the BASE does
not.**
**Verify:** tax receipts are more cyclical than profits; carryforwards revive and expire;
investment timing responds to depreciation treatment.

### SCALE — Universe scale-up under a wall-clock budget  *(item 6)*

**MEASUREMENT-GATED — profile first, always.** The question is a FRONTIER (names against
seconds/week), not a feeling: how many firms can the simulation carry before week-time becomes
unacceptable, and what breaks first.
- **Optimise without changing economics.** Algorithmic wins only. Two hard constraints:
  determinism is sacred (same-seed A/B must be byte-identical), and no economic shortcut dressed
  as an optimisation (sampling participants, truncating books, skipping small names change the
  market, not the speed).
- **Columnar state is the path below 300 ms** (§7.80): the hot per-company and per-holding numbers
  in typed-array columns, the object graph rebuilt as a VIEW. A SCALE-grade rewrite with
  determinism gates at every step. **Do not start it as a side effect of anything else.**
- **It owns the float half of the damper defect:** thin books are why prints pin. **DIST challenges
  the premise** — depth in a book may be partly a RESOLUTION problem, obtainable at 10–20 weighted
  nodes per pool rather than tens of thousands of firms. Measure before spending the budget.

#### WAVE 2 — the design, from the measurements (§7.212–216)

**The diagnosis in one line: the economics is ~70 ms and the other ~1,330 is a graph of ~150,000
heterogeneous JavaScript objects being walked by pointer, allocating as it goes.** Every remedy
below follows from that and from nothing else. Numbers are this engine's, measured.

1. **STRUCTURE OF ARRAYS, AND AN ENTITY IS AN `int32`.** One table per kind — companies, holdings,
   tranches, contracts, pools, cohorts — each FIELD a typed-array column (`Float64Array revenue`,
   `Int32Array region`, `Uint8Array flags`). No per-entity object exists at all; a company is a row
   index. This is what kills the flat profile: the measured 78 µs FLOOR per company in stage 08
   (p10, not the tail) is not arithmetic, it is chasing a 72-field object and building another one.
2. **STRINGS DIE AT THE BOUNDARY.** Every ticker, id, instrument key and payment reason is interned
   to an `int32` at load. Measured motivation: 145,000 distinct payments a week, each building four
   party-key STRINGS, plus a `${type}:${id}` per holding row in every register walk. Identity
   becomes an integer compare and `Map<string, X>` becomes a dense array indexed by id.
3. **RELATIONSHIPS AS CSR, NOT NESTED ARRAYS.** The register is a bipartite graph (holders ×
   instruments) traversed in BOTH directions every week. Hold it as compressed sparse rows:
   holdings of entity `e` are `rows[start[e] … start[e+1]]`, and the transpose — holders of
   instrument `i` — is rebuilt by counting sort in one linear pass, no maps, no allocation. **That
   single structure retires all twenty-eight register sweeps and every "who holds X" lookup**,
   which is what §7.216's ETF quadratic and §7.212's estate rescans both were.
4. **ARENAS, NOT ALLOCATION.** Per-week scratch — plans, schedules, the payment journal — is
   written into preallocated typed arrays with a bump pointer and reset at the week boundary. GC
   measured a steady 8.5–8.9% of every profile and much of the "self time" in the big stages is
   allocation wearing a function's name.
5. **PAYMENTS AS A COLUMNAR JOURNAL.** `payer: Int32Array, payee: Int32Array, amount: Float64Array,
   reason: Uint8Array`, appended by bump pointer. Netting is a counting sort by payer plus a prefix
   sum — a linear pass over three columns instead of 145,000 objects and 580,000 string builds.
   §7.215 measured coalescing as a dead end precisely BECAUSE the rows are genuinely distinct; the
   answer is to make a row cheap, not to have fewer of them.
6. **A STAGE IS A KERNEL OVER A RANGE**, not a `.map` over objects. Monomorphic loops over columns
   are what V8 compiles well (the 405 "wrong map" deopts per four weeks are polymorphic object
   shapes flowing through shared code), and — the real prize — **columns in a `SharedArrayBuffer`
   are shardable across workers with NOTHING to clone.** §7.777's "the clone numbers say why
   workers cannot touch it" is a statement about the object graph, not about the parallelism, and
   it stops being true the moment the state is columnar. On 4 cores that is the difference between
   the ~300 ms this design reaches single-threaded and something well under it.
7. **DETERMINISM IS PRESERVED BY CONSTRUCTION, not by care.** Iteration order is row order; sharded
   reductions combine in shard order. `financial-clearing-engine.ts` already does exactly this and
   is byte-identical to serial — **it is the proof the pattern holds in this codebase**, and it is
   why its kernel is the one part of the engine that does not appear in the profile.

**What survives untouched:** the economics. The formulas, the clearing rules, the accounting
identities are perhaps a tenth of the lines and a twentieth of the runtime. This is a rewrite of
how state is LAID OUT and TRAVERSED, not of what the model says.

**What must NOT be repeated from the current design:** one giant serialisable `GameState` object
(§7.216 found 105,000 ledger keys being converted to a plain object and back every week for a
reader that does not exist); string identity; and stages that allocate.

**The migration is a strangler, not a big bang.** The SoA store lands behind the existing
accessors; stages convert one at a time with the object view kept as a debug-only materialiser.
**The repo's determinism discipline is what makes this safe** — bit-exactness is checkable after
every commit, which is not true of most rewrites.

#### WAVE 2 — the execution order

**Sequenced prove → biggest → parallelise → finish.** Milestones 1–3 (§7.217) are done: party ids,
the register's CSR index, the payment journal. Those were the parts that fit behind existing
accessors. What follows moves the state itself.

**PHASE 0 — THE GATE, AND IT IS NOT THE ONE IN USE.** Every step so far was gated on a 20-week diff
of the harness's PRINTED lines. That is not sufficient for this work: a column conversion that drops
or misorders a field nothing prints passes it silently. **Before any table moves, the gate becomes a
hash over the whole state** — every column of every table, in row order — asserted equal against the
object-graph run. Cheap to build, and it is the thing that makes every later step provable rather
than hopeful. **Do not start Phase 1 without it.**

**PHASE 1 — THE PRIMITIVES.** Three pieces of infrastructure, no behaviour change, each with its own
tests: a `Table` (named typed-array columns over one `SharedArrayBuffer`, growable, row ids, a free
list); the string INTERN table (already exists for parties and payment reasons — generalise it); and
the per-week ARENA with a bump pointer and a reset at the week boundary. Nothing gets faster in this
phase. Skipping it is how the rewrite turns into a rewrite of itself.

**PHASE 2 — HOLDINGS, to prove the machinery.** ~110,000 rows, five fields, and its CSR index
already exists (§7.217). Twenty files read it, and the reads are the mechanical kind. It is the
right first table because it is big enough to be a real test and small enough that a mistake is
findable. The object view survives as a materialiser for the UI and the harness. Expect a modest
wall-clock win; the point of this phase is that everything after it is mechanical rather than novel.

**PHASE 3 — COMPANIES, the one that pays.** 2,496 rows × ~72 fields, and `runCompanyFundamentalsStage`
is 196 ms of the remaining 1,200 with a **78 µs per-company floor** that is pointer chasing and
allocation, not arithmetic. This is the biggest single item in the engine and the most-referenced
type in the repo, which is exactly why it goes AFTER the machinery is proven and not before. Convert
the table, then the stage-08 body kernel by kernel — its seven sections are already identified.

**PHASE 4 — PARALLELISE.** Only now. Workers multiply whatever is already columnar, so doing this
before Phases 2–3 would multiply almost nothing — which is the real reason §7.213's worker
measurement came back dead. Shard the kernels over the `SharedArrayBuffer`; combine per-shard
reductions IN SHARD ORDER. `financial-clearing-engine.ts` already does exactly this and is
byte-identical to serial: **it is the pattern to copy, not to invent.**

**PHASE 5 — THE REST, then delete the graph from the hot path.** Tranches (~8,600), the contract and
plan books, the cohorts and pools. Then the object graph exists only as the debug/UI materialiser,
and `GameState` stops being one giant object.

**THE PROJECTION, PHASE BY PHASE.** Phases 0–1 buy nothing. Phase 2 is modest. **Phase 3 is the step
that takes the cycle under 300 ms single-threaded**, and Phase 4 is what takes it under 100. The
payoff is back-loaded and the plan should be judged on Phase 3 landing, not on Phase 1 feeling slow.

**IF A STEP CANNOT BE BIT-EXACT, STOP AND DECLARE IT.** The whole value of this sequence is that
§7.211's measurement programme survives it. A step that reorders a float sum is a world relabel and
costs that; it is allowed, but it is a decision with a record, not a shrug in a commit message.
- **Stale, and left as the standing warning:** earlier text called `09-concentration-risk` "the
  cheapest win on the table: 98 ms a week for flags nothing prices off." **CRD-R1 gave it a
  consumer** (§7.184). Read the code before believing a row.

### S-final — the validation gate  *(item 7)*

Full `npm run verify` green, plus the §4 measurement debt read in order. Nothing ships after this
until it passes.

### AU — Aurora, the UI rebuild  *(item 8)*

Delete every current UI element and rebuild. **Required process, fixed in advance:** (1) a LONG
iterative series of clarifying questions via AskUserQuestion — visual direction, information
architecture, interaction patterns, reference products, platform scope; (2) mockups the user reacts
to BEFORE production code; (3) real-world product inspiration. Scope is `src/components/` plus
`App.tsx`; the engine and domain layers are untouched.
**Folded:** UI state lives inside `GameState` (`isTradeModalOpen`, `selectedInstrument`, …) — the
object the determinism hash spans, so a modal click can make two identical runs disagree. Aurora
moves presentation state to the UI layer.

### DIST-P — the primitive scoreboard  *(the rule is §1.19)*

**The answer, measured:** the household cross-section needs **two** permanent primitives —
PATIENCE (what makes a wealth distribution stationary rather than divergent) and RISK AVERSION
(the precautionary motive a confidence shock works through) — plus one temporary illiquidity
friction. Firms need **zero to one**. Against ~90 stated numbers at the 2026-08-30 count; **the
count stands at ~41 and may never rise.** §7.208 retired `TIER_WAGE_MULTIPLIER`,
`LABOR_SHARE_OF_OUTPUT` and the four bid-premium numbers, and added the demand ladder's rung count
— a RESOLUTION parameter, which §1.19 does not count.

**It can be this small because this model generates its own idiosyncratic income risk.** A standard
Bewley/Aiyagari model must STATE the income process, fitted to data, which rule 4 forbids outright.
Here a household is unemployed because a real firm laid it off at a real vacancy. **That is the
largest single saving available and it is already banked.**

| Stated block still open | Dies with |
|---|---|
| `TIER_OCCUPATION_MIXES` (14) | the occupation mix as an outcome of who the firms actually hire — DIST's remaining half. `TIER_WAGE_MULTIPLIER` went in §7.208. |
| `PARETO_ALPHA`, `NAMED_TIER_REVENUE_SHARE` | real entry and exit — DYN |
| `WEALTH_SPENDDOWN_YEARS` | the illiquidity friction, retired when housing wealth is fully spendable |

---
## 6. Defects and watchlist

What no project owns: live defects needing a decision or a measurement, and metrics to watch
rather than work. **Rows closed since the last cleanup are not duplicated here — §7 has them.**

### 6.1 Live defects

| Defect | State and next action |
|---|---|
| **THE REGISTER OPENS AT A QUARTER OF ITS OWN STEADY STATE** | §7.213: 32,278 holding rows at seed → ~103,000 distinct positions by week 5, ~122,000 rows by week 15. **15% are duplicate `(holder, instrument)` rows and 9% are under $1,000.** §1's §7.4 rule is that the seed opens in the shape the weekly engine produces; this one does not, and every stage that walks the register pays for the gap. Consolidating duplicates and dust is ~25% off every register walk — the largest algorithmic item left. Owner: the seed, with SCALE. |
| **THE LABOUR MARKET FAILS OVER A LONG HORIZON** | Distinct from §7.210's quit rate, which is fixed and holds for ~12 weeks. Over 60, EUR reaches 65% unemployment and UK prints 0.0% at week 49 — 52 band violations across EUR and JPN. **Next action: the same treatment that worked in §7.210 — find the week it turns, and check what is FLAT while employment moves.** Owner: HH5/LAB. |
| **SUPPLIER MARKET SHARES DO NOT SUM TO 100%** | ~120 violations over 60 weeks in `agricultural_commodities` and `network_infrastructure`, in all four regions. **A goods-market accounting defect with nothing to do with prices**, invisible until the harness could run this long. Cheapest of the open rows and probably the most self-contained. Owner: the goods market (IND). |
| **REPO COLLATERAL IS OVER-PLEDGED** | The largest single family in §7.211 (XIVF 56x, THSY 54x): a bank pledging more of a tenor bucket than it holds. `repoEncumberedCollateralUSD` is supposed to be reconciled against holdings every week by `reconcileRepoPledges`. Owner: WS6/REPO. |
| **EUR GOVERNMENT OUTLAYS EXCEED ITS BUDGET** | New in §7.210's run, twice in twelve weeks (3.96B against 2.63B at week 11) and only in EUR. Interest and transfers are contractual and paid in full (PUB1e), so an outlay above budget means one of those grew past what the stance allows — most likely the interest bill, which CAL now pays on real dates. **Next action: print EUR's `decomposeGovernmentSpending` parts against `governmentOutlaysUSD` in the weeks it trips.** Owner: MAC. |
| **THE PRICE LEVEL NEITHER SETTLES NOR COMPOUNDS — IT OSCILLATES AT ~200%** | Bisected to COH4's demand ladder (§7.208): the commit before it prints −4.78 and this one 34.96, on identical everything else. **The ladder is not obviously wrong and that is the point.** It posts the households' own derived reservation — a staple can draw on the whole budget, so the reservation is ~3.3× the going price — and a supply-short goods market clears there. Forcing the reach multiple to 1 drops week 1 from 29% to 3.3%, so the reservation is the driver; but the reservation is measured, and **the shortage it is meeting is §6's own damper defect, which the retired 1.9% bid premium was suppressing as rationing.** So the ladder did not create this; it stopped hiding it. **Do not put the premium back and do not cap the bid.** The well-posed question is why the goods market cannot supply the registry's own stated per-capita want. **Read at 60 weeks (§7.211): 29 → 102 → 274 → 90, no fixed point and no runaway.** Owners: the supply-side work (SCALE/PROD), with COH4. |
| **THE CAPITAL-GOODS SECTOR CANNOT SUPPLY THE ECONOMY'S CAPEX** | Firms bid their real capex and the basket weights sum to 1, so the bids ARE the capex figure: **~163B/yr of bids against ~13B/yr of deliveries, an 8% fill** (§7.167), four of five categories short at 65–174% over base (§7.168). §7.178 made the demand LEVEL honest (gap 1.55x → 1.29x) and §7.199 closed the seed's investment fixed point. **Both are UNMEASURED and this is measurement item 1.** It is the accumulated cost behind the ~29% unemployment that has been blocking unrelated work (§7.179). |
| **THE BOOKS PRINT THEIR DAMPERS** | The engine states its own failure condition: a name clamped for weeks means the posted schedules disagree with the printed level and **the print is the damper, not the market.** Last measured **947 persistently bound** (890 before the OWN7 sweep, peaking at 1042 before the desk-position fix). §7.197 records the rise as the honest shape of deleting the residual dealer: **the pressure was always there.** **Do not widen the damper.** The well-posed question is: who buys when the holders as a group want less than they hold? Owners: SCALE (the float half), and the measurement run. |
| **A SHOCK TEST STOPPED MOVING ITS PRICE** | `checkSustainedEquityDemandMovesPriceBeyondEps` — sustained institutional equity demand against an identical control world — no longer moves the name's price. Same signature as the sovereign-auction shock test: demand so far below the enlarged float that both A/B worlds pin at the damper. Re-measure after G3e's float change. |
| **A HOUSEHOLD'S EQUITY IS NOT A POSITION IT CAN SELL** | Forced selling is BUILT and settles both ways, and it reaches **$0.0B of $985B** (§7.166). **Only fund shares have a trading channel** — direct equity and private business are computed as RESIDUALS, so there is no position to sell however badly the cash is needed. **A holding that cannot be sold is not a holding.** Owner: the ownership register. |
| **THE UNMODELED BOUNDARY — FOUR declared frontiers** | `BOUNDARY_FRONTIERS` in the harness declares every reason that may still cross with its owner; anything else fails on the week it appears. **It is a list to shorten, never a place to add a line to make a run pass.** Standing: `non-auction operating receipts` (now the accrual lag between a week of sales and annual revenue — §7.207 changed what it measures), `other opex beyond auction settlements`, `inventory carrying cost` (only a region with no distribution firm — §7.205), and `estate distribution`. **Closing the first entirely is a PAIR with the cost line beside it:** both are accruals, and removing one side's boundary settlement without the other makes every firm bleed cash. |
| **A RETIRED BANK FACILITY REACHES NO LENDER** | Opportunistic deleveraging retires whatever is economic to retire, and a drawn FACILITY on that list leaves the issuer's ladder with no lender repaid. **Do not fix it by paying the bank alone** — the facility is also an itemized loan on that bank's book, and moving the cash without shrinking the asset breaks the per-bank identity, which is exactly what happened when it was tried. One change to both sides, together. Owner: G2. |
| **A DISCOUNT BILL'S YIELD REACHES NOBODY'S CASH** | The bill books clear a YIELD but buyers pay FACE and are repaid FACE, so a bill is bought at par, redeemed at par, and returns nothing whatever it cleared at. The auction pays what the buyers paid. Owner: the bill book's price/face split. |
| **THE GOODS-PAYMENT PATH PASSES BUYER-LOCAL MONEY AS `amountUSD`** | In stage 05 the ex-works and freight legs pay a figure in the BUYER's local money straight into `pay({ amountUSD })`, while the trade invoice beside them converts the same quantity properly. **One of the two is wrong and they disagree.** Finding which is a currency-units audit of stage 05, not a line to patch. |
| **THE INSTITUTIONAL SECTOR'S OPENING SIZE IS STILL ASSIGNED** | `INSTITUTIONAL_OPENING_BOOK_SHARE` is down to one entry, `equity: 0.42`, read once at week 0. It needs an asset manager anchored on the households' own fund holdings. Owner: COH. |
| **A MANAGER AND A VEHICLE IN ONE OBJECT** | `HEDGE_FUND` and `PENSION_FUND` are both. A manager is a firm with staff that earns a fee; a fund is a pool with units. **One entity being both means neither is modelled — the same defect as a second code path, in the type system.** The ETF is the template. Unassigned. |
| **FX SWAP LINES DO NOT EXIST** | Major-currency central banks almost never intervene in spot; the routine stress instrument is the standing swap-line network. Needs an FX funding market first. |
| **EVERY REAL-ECONOMY FX CONVERSION HAPPENS AT MID** | The desks that make the market and warehouse its residual earn nothing on it, and crediting them a spread without a payer would print money. Owner: the FX book. |
| **LOGISTICS IS 0.4% OF GDP AGAINST A REAL 5–6%** | Every dollar reaches a named carrier, but the sector is an order of magnitude too small; domestic tonnage is the gap. **IND16's channel margin (§7.205) is the first thing that adds to it — re-measure before working this.** |
| **FREIGHT RATES RUN AWAY ON SOME LANES** | Over 40 weeks EUR>UK went 6.28 → 292,929 per tonne while EUR>EUR fell 59%. XB6 (§7.189) fixed the FX geometry underneath it, and the carrier offer floor now carries the capital charge (§7.176). **Unmeasured since. Re-measure before diagnosing.** |
| **DOES THE TREASURY OPTIMISE ISSUANCE ON THE CURVE? — A DECISION, not a defect** | The model's treasury leans opportunistically in two places (the bill share and the tenor mix). **Needs a user answer; do not change it unilaterally.** |
| **THE USA BANK COHORT — DIAGNOSED, NOT A BANK DEFECT** | The bank's arithmetic is right; its stress is the joint product of the corporate-cash boundary, the absence of hedging (now largely closed by DER) and policy driven high by the price level. **Do not tune the bank.** Re-measure after the debt above. |
| **CONSEQUENCE ROWS — a number is not a work item (rule 18)** | The price level (G1b), the labour collapse (EMP), equity prices running away past ~week 80, and real growth prints escaping at horizon. **All four are evidence, and all four are void as scoped:** every one of them was measured before the IND, CHAIN, CAP, DIST, DEM and market-tier work, and none may be inherited. Re-measure, then decide whether a mechanism is missing. |

### 6.2 Watchlist — measure, do not fix

| Metric | Why it is here |
|---|---|
| `unmodeledFinancialAssetsUSD` | The scoreboard for what the model contains but does not attribute. It earns nothing, moves with nothing, and only shrinks. |
| `governmentInterestToUnmodeledHoldersUSD` | The share of the coupon bill with no modelled recipient — foreign holders. The debit is real and the crowding-out it causes is real; the credit is missing. |
| `unmodeledCapitalReceiptShareOfIncome` | The slice of the debt-service recycle whose return path to household income is unbuilt. Decays as each receipt channel becomes real. |
| `unbackedBankCashUSD` | Reserves grow from deposits and lending faster than any central-bank purchase backs them. 97B (w13) → 2,183B (w120) at last measure; **the 60-week harness cannot see it.** |
| The TGA over a quarter-scale horizon | It sawtooths on the remittance dates, which is the shape a treasury balance has. Watch the LEVEL, not the shape. |
| Occupational mismatch | One occupation tight while two carry real unemployment against zero vacancies. Produced by sector composition moving faster than retraining. |
| Sovereign price elasticity to a size-only bidder | A 34B difference in the CB's book moved the USA 2Y ~490bp. Consistent with the damper row: the books ARE thin. |
| The goods market cannot fill a quarter of what is bid | Aggregate bids exceed aggregate supply and every in-money bidder is rationed pro rata. Became visible only when the government's unfilled demand had a cost. |
| Household income: a top-down statistic against a bottom-up sum | What employers actually pay is measured; `estimatedHouseholdIncomeUSD` remains the top-down anchor sizing consumption and the tax base. |
| The named private tier still sells nothing | The ~300 seeded private firms per region carry `productLines: []` and cannot participate in any auction. Born firms get real lines; the seeded ones do not. |
| Index funds without a buyer | Was 15 of 27, now 10. The empty broad-market funds were a missing SECTOR, not a universe-size problem; what remains is the genuine version. |
| Loan-book Spearman noise | Spearman(leverage, DM) runs 0.26–0.76 where the bond book holds 0.78–0.93 — consistent with sampling noise at 23–32 names. Re-measure as the universe grows. |

### 6.3 The clamp discipline

**A clamp is almost always covering for a decision that is not being taken.** Delete it only once
the decision is real (§7.167), and never delete a stand-in before the mechanism it stands in for
exists (§7.158, §7.177). The programme is closed (§7.176); what survives is the rule.

The rule audit that ran alongside it is discharged: **all nine of §6.3-A's stated household
cross-section tables are measurements** (§7.145), and the primitive scoreboard that replaced it is
§5-DIST-P.

---
## 7. Record and lessons (do not re-learn)

Referenced from §5 and §6 — **never renumber.** Each entry: what was wrong, the number that proved
it, the lesson. Compressed 2026-08-30 under rule 11; no finding, number or lesson was dropped.

1. **"1$ is 1$" is at rest on the goods side.** Real auctions, pro-rata clearing, per-lot FIFO input provenance, capex as real bids, commodities linked to real producers.
2. **Sovereign demand signals mean-revert.** An invented fair-yield level, and trend-following signals, both run away. A sovereign carries no credit risk, so a yield move is a valuation event.
3. **Targets are relative weights on real pools.** `pct × totalAssets` sums to ~2.8x the real market; distribute an already-bounded aggregate instead. **Amended (§7.18):** a large renormalisation factor is information — the asset universe does not match the money pointed at it. Read it, don't divide it out.
4. **Seed shape must equal engine shape.** A cold start in a different shape than the weekly engine produces creates a fake week-1 shock. The most repeated defect here (§7.10, 21, 31, 49, 55, 58). Strictest form: seed by calling the engine's own code, not by writing something that resembles its output.
5. **Shared-field collisions** (two writers, one field) caused four mass-collapse bugs. When a value is per-X, key it by X.
6. **Cash-constrained bidders ration quantity, not price** — underpricing under pro-rata clearing is a permanent shut-out spiral.
7. **Rating agencies lag, spreads don't** — keep the fallen-angel forced re-rate.
8. **Wall Street phases 1–2, slices 1–3.** Per-bank balance sheets, SRF/ON RRP, corp/sovereign/loan clearing, generic engine extraction.
9. **S1 — the income/GDP identity.** Tier premiums (1.35^tier) on a GENERAL wage already at 62% of output made the wage bill 93% of output and household income **106.6% of GDP**. Normalise premiums by their employment-weighted mean over the BASELINE mix — never the live one, or a real skill shift cancels itself. Week-2 USA growth +113% → +1.54% against 1.80% potential.
   - `bootstrap/national-accounts.ts` owns the identity. Four duplicated definitions collapsed (occupation shares, the 0.35 procurement literal in three copies, the household-income formula, bilateral trade).
   - **Transfers are not purchases.** The identity counted 100% of outlays as G while demand spent 35%. Transfers reach GDP through C; only procurement is G.
10. **S2 — the yield curve has one owner.** 07c's auction is its sole author; `macro/evolution.ts` computes no curve.
    - Policy reaches the front end through banks' reserve arbitrage: +100bp moves the 2Y +43bp in week 1, ~93bp by week 3, the 10Y under 20bp. A hike flattens through demand.
    - **A tilt alone cannot anchor a level.** Given only a cross-tenor tilt everyone crowded into short paper and the 2Y sank 349bp BELOW policy. The bonds-versus-cash choice must sit OUTSIDE the slow strategic drift; folding it inside throttled a hike to under half its pass-through.
    - Two §7.4/§7.5 bugs: banks held a scalar sovereign total but an EMPTY per-tenor book, so every bank opened ~$147B under target and bought forever; and maturing tranches left the government's books but not their holders' — by week 52 banks owned 1.30x the entire 2Y float and trading that phantom ran the 2Y 6% → 25%.
11. **G1 — inflation is measured, not assumed.** A real basket at the prices stage 05 clears, 52-week change, core ex food and energy, chain-linked.
    - **Dead:** the AR(1) anchored on target (0.98 persistence multiplies any persistent addition ~50x), the wage-push term, the money-growth term (inflation feeding itself through fake real growth), a weather shock at an invented basket weight.
    - **The bug worth more than the feature:** stage 03 rebuilt each category weekly and dropped every field a later stage owned — above all `unitPriceUSD`. Bootstrapped ~$70k/unit prices died in week 1 and **every price in the economy rebased to ~$1.** A stage writes the fields it owns and nothing else.
12. **S3 — three structural bugs, each found by tracing a number to its source.**
    - **The leveraged-loan market did not exist.** Each rung tested `cumulativePrincipal < share × base`, which is zero at the first rung, so the first tranche was FIXED for every issuer and floating float was zero market-wide. Test each rung's MIDPOINT.
    - **Corporate holdings did not track the corporate stock.** By week 24, 130 of ~184 issuers had institutions holding more than the entire float; spreads fanned to −1097/+1757bp. Where the snapshot is taken matters.
    - **The "accretive call" was deleveraging, not refinancing** — the bond float halved in six months. A call for value replaces at today's rate and keeps the money.
    - **Lesson: a market cannot be signed off by watching its price. Watch its FLOAT and its HOLDINGS first.** Every one of these was invisible in the spread series.
13. **S4 — money moves with the securities.** All adapters apply `netCashDeltaByParticipantId`. Dealer revenue is what clients actually paid (charging NET client flow waived the desk's spread on both sides). New invariant: cash plus securities may move only by real flows — worst week 0.47% against 5%.
14. **RV demand — allocation responds to price.** `excess = (spread − expected loss) − (capital charge × required return)`; the policy percentage becomes the centre of a band. It scales the SIZE of an already-bounded pool rather than redistributing a fixed one, which is why it acts on the level where a tilt cannot.
    - **A ratchet found on the first attempt:** applying the tilt to a target anchored on CURRENT holdings feeds back — selling lowers the book, which lowers the target, which sells again (78bp → 1388bp). Apply it to the STRUCTURAL target.
15. **RV supply — the float responds to its own price.** Each issuer gets the financing decision; one real limit (a covenant leverage ceiling by rating, no access for defaulted issuers). Float 77B → 104B into tight spreads, the spread recovers −22bp → +86bp, then deleveraging runs 113B → 98B. A credit cycle, from nothing.
    - **Lesson: a price that will not stay put usually means one side of its market is missing.** Ask what is structurally absent before tuning what is present.
16. **E1 — the engine prices a demand schedule.** Spearman(OAS, ownership) −0.731 → +0.05…+0.22; Spearman(leverage, OAS) 0.78–0.93; zero negative spreads; median OAS monotonic by rating.
    - Three quantity-era approximations that were harmless as nudges and fatal as prices: a raw logistic used as an annual PD (~98% for a stressed borrower); the IG mandate as a PROHIBITION, so a downgrade deleted 60% of a name's buyer base (replaced by a capital charge plus a sleeve limit); and the auction returning its 50,000bp search bracket as a price. **The fix for the third was itself wrong and was retired (§7.20)** — a recovery-derived ceiling. A bond trades below recovery routinely; that gap is where a distressed investor earns its return. **It is easy to justify a bound with a plausible real-world story and hard to notice the story only holds for a participant not yet in the market.**
    - **Lesson: a number that is directionally right is good enough to nudge a quantity and not good enough to be a price.** Converting one into the other re-audits every input it touches.
17. **The phantom leveraged-loan market.** `Company.leveragedLoan` was attached to every company, but 167 of 200 had no floating debt, so those quotes were never cleared — frozen at generation value and dominating every published statistic. **When a market's statistics look random, check how many of its instruments are actually IN the market.**
18. **The money and the assets were never reconciled.** Aggregate institutional money roughly matches the universe (USA ~846B vs ~857B). The composition breaks in exactly one place: equity 615B available against ~340B wanted (0.6x), sovereign 201B/250B (1.2x), **corporate credit 41B against ~262B (6.4x)**. The missing supply was the hidden corporate sector — 549.4B of debt, 86% of the region's corporate debt, as a scalar nobody could own.
    - **Method note:** the first version of this probe read a nonexistent field, reported 0, and made a 6.4x credit shortage look like a 1.3x aggregate glut. When a probe reports a round 0 for something that should be large, verify the field name.
    - **Lesson: before rebuilding a mechanism, measure whether the thing it operates on is the right size.**
19. **Post-E1 review.** Sound as built: national accounts, measured CPI, single-owner curve, the double auction and its adapters, the CFO decision, cash legs. Refinements since closed: two default models (§7.20), the per-name normalisation guaranteeing demand ≈ float (§7.21), near-parallel demand curves (§7.52), the hedge fund existing twice (§7.21).
20. **E2 — two pricing regimes, one default model, no ceiling.**
    - The priced hazard is a structural forecast of the real trigger: how large an EBITDA shock puts the firm inside the ACTUAL trigger (coverage floor AND cash exhausted — the AND honoured by taking the larger required shock, so a levered firm with runway is safer than coverage says), and how likely that shock is given its own measured revenue volatility.
    - Distressed paper prices off recovery as a second REGIME, not a bound: the HF reservation sits ~795bp on performing paper and arrests widening at 1,200–2,700bp.
    - The IG ladder's slope is rating- and duration-granular spread-risk capital. With a structural PD, expected loss on all IG is a truthful ~0bp, so a flat within-IG charge collapsed every IG reservation to one number. **When a defensible model change flattens a distribution, the missing dispersion was probably being smuggled in by the old model's error. Fix the newly exposed structure; don't re-inflate the input.**
21. **S11 — bids are bounded by money, books are marked, income is real.**
    - Income leg completed. Sovereign coupons deliberately NOT credited until PUB: crediting a holder without debiting a payer creates money.
    - Budgets: what an entity can ADD is real cash plus the leverage its type runs. Worst cash/assets 0.0% for insurers/pensions, +14% floor for the hedge fund; pre-S11 it was −10% for everyone, permanently.
    - **The per-name normalisation is deleted, and deleting it forced the engine fix it hid.** When the buyer base cannot absorb the float at any level there is no crossing, and the old solve returned its search bound as a price. `solveClearingStat` now clears at the SATURATION point with the dealer holding the residual. **A bound is not a price; the widest level any actual buyer needed IS.**
    - Known intermediate state: HY medians cluster at the distressed backstop because the HY buyer base is genuinely short of the HY float. Do NOT tune sleeves to a spread target.
22. **RVr — the credit cycle's amplitude is real.** Median IG OAS breathes over a 75bp band (166–241). The expectations channel is not needed for credit amplitude.
    - **The quantity drain was a real defect:** the CFO measured "what capital earns in the business" as EBITDA over debt + MARKET cap, so its internal hurdle was a function of the stock market's mood and rich equities made every IG firm read 150bp debt as too dear (the float halved in 60 weeks). Replaced with return on INVESTED capital plus a deployment-flow cap: covenants bound the STOCK of debt, the pipeline bounds the FLOW.
23. **S5 — the cash walk is one explicit ledger.** `post(label, amount)` is the single write path; Σ(entries) = Δcash to the dollar. Four leaks died as consequences. Public defaults by week 121: 59 → 46.
    - **Dividends were 10x real** — yield × market cap on inflated equity bled 15–25M/week from companies selling 20M/week, invisible while dividends never actually left.
    - **Firms bought ~2x what they sold:** the real CASH margin was deeply negative while formula EBITDA reported +18%. Invisible before the ledger, which is the ledger's whole argument.
24. **The fantasy contract flow.** Supply contracts were sized by a hardcoded random ladder with no relation to the buyer's real need — one committed a buyer to 35M/week against 8.5M of revenue, and ~90% of the auction's apparent volume was this churn. A contract is now the locked-price form of the buyer's real demand: P/S 0.04–0.58 (from 2.7–7.5x), honest volume ~0.7B/week against 8.9B.
    - **Lesson: when a flow's PRICE side is made real but its QUANTITY side still holds an invented number, settling the cash converts the invented quantity into real damage.**
25. **S6 — every duplicate price-setter deleted.** Stage 12 marks off cleared stats; `priceLeveragedLoan` is a pure converter; two premium formulas deleted; the UI stopped re-deriving engine formulas (including a pasted copy with a ×1,000,000 unit bug). **A check that shocks retired fields tests nothing.**
26. **S7 — one holdings ledger, and a hidden sovereign collapse.** Two opposite defects died together: stage 11 rebuilt sector holdings by a parallel formula, and the macro aggregates were written ONCE at init and never again — a frozen week-0 snapshot the UI, stage 08 and stage 02 all read as current. With the aggregates live, USA institutional sovereign holdings collapse ~284B (w20) → ~1B (w40) with entity cash 20B → 309B. **The books were doing this all along; the frozen aggregate reported a steady 201B.**
27. **The sovereign collapse fixed, and the first optimisation pass.**
    - **Anchored inflation expectations.** The reservation yield used the raw current expectation at every tenor, so a 16% print demanded 17.5% on a 10-year bond and demand went to zero. A bond now prices the AVERAGE expected inflation over ITS OWN tenor — the defining property of a credible targeting regime, not a damper.
    - **Liability-driven core** (`minHoldingUSD`): a mandate expressed as SIZE, never as a price. Institutional sovereign book 0.0B → 133.0B, 10Y 21.6% → 5.1%.
    - 5,280 → 924 ms/week. Every win was an index rebuilt inside a per-item loop. **Profile before optimising:** the first pass hoisted the obvious filters and bought 6%.
28. **G1b root cause — production capacity was denominated in dollars.** Stage 05 sized output as `annualRevenue/52 × shares` then divided by the CURRENT price, so a price rise made the same plant produce FEWER units: the wrong sign, closing a positive feedback loop.
    - **The measurement that found it:** tracing every category rather than the index, the MEDIAN category never moved while a handful ran away (defense_systems 9.3x), and in every spiralling one supply was collapsing as price climbed. **An economy-wide monetary story cannot produce a flat median; a broken supply response can.**
    - Capacity is a physical stock in UNITS, evolved by real net investment. Inflation went from a monotone runaway (15.7% → 78.7%) to −3.9% → −7.6%.
29. **S8 — contagion was a permanent scar.** `recentDefaultsCount` counted every company that had EVER defaulted, so a week-3 default still tightened credit in week 200. Now a rolling 52-week window plus the currently distressed cohort. Also: `clearedInputPriceIndex` measured week-over-week while consumers read it as a level versus baseline (rule 9). Over 110 weeks inflation went from ±20% oscillation with 62.8% spikes to a narrow band with none.
30. **S9 — player flow is real client flow.** `executeTrade` sourced positions from a derived view, so **every write was silently discarded**; both sides also paid the markup, and maturities credited face value AND the realized P&L. **A write to a derived view is a write to nothing** — a silent no-op, not a visible error.
31. **WS4 — the stock price is cleared.** 07e clears every listed name **in shares**; a dollar-denominated book would have its size depend on the price it is supposed to set. Each holder posts its own fair value at its own required return, and that disagreement is the demand curve's slope.
    - **An engine bug equity made visible:** the damped level and the allocated quantity were inconsistent, printing as institutions holding **229% of a company's shares**. Fills are rationed pro rata to float.
    - **§7.4 again, and it cost the most here:** companies were seeded at `eps × sector basePE` (capitalising at ~1.5%) while holders capitalise at 4–10%, so week 1 opened at ~4x any real bid. Median P/E 66.7 → 10.1 at week 0, 11.1 at week 60.
    - Two sign bugs: the structural PD annualised `dividendsPaid` SIGNED, so paying a dividend scored a company as safer; the buyback test compared against a valuation the market no longer used.
32. **Determinism, and a guess-free profiler.** 51 raw `Math.random()` sites meant no before/after measurement ever compared the same economy to itself. All engine draws come from `engine/rng.ts`; the seed and stream position live on GameState. `npm run verify` defaults to 60 weeks — every real finding has come from the first sixty. Second optimisation pass 920 → 490 ms/week, byte-identical.
33. **HC Wave 1 — the hidden sector is real firms.** ~301 named private firms per region carved out of the segment aggregates, with real ladders clearing in 07b/07d. Debt conservation exact (549.4B = 75.5B firms + 473.9B residual); 292 loan names, 246 private — the leveraged-loan market is mostly sponsor-owned private paper, as the real one is. Want/have 6.4x → 3.8x.
    - **The finding that reshaped the numbers:** the segment primitive `debtUSD = 2 × revenue` implies ~15x debt/EBITDA. The first carve scaled real ladders up to meet it and killed a third of the cohort in 26 weeks. The tier carries what real leverage services.
    - Two measurement bugs: an employment change must be measured over the SAME firm universe on both sides of the week; an unsold-production penalty must only exist for a firm that offers into a modelled market.
34. **WS5 — bills and commercial paper.** ~18% of each sovereign ladder is 13/26/52-week paper in 07f; the NS curve refits through all seven cleared points so `tenor3M` is a market print.
    - **First CP formulation found no issuer in 60 weeks:** it looked for a projected cash DEFICIT, and almost nobody projects negative cash. Real CP funds the working-capital STOCK of issuers who run lean. **Sizing a market off the tail event instead of the standing need finds no market.**
    - `sovBucketKey` is the ONE tranche-to-bucket mapping; the three independent nearest-of-[2,5,10,30] reducers it replaced would each have folded a 13-week bill into the two-year bucket.
36–40. **The bank flow ledger, S10, WS6–WS8 and G2.** (No item 35.)
    - **36.** `evolveBankingSector` computed reserves as a PLUG; every mutation is now a named flow posting to both sides, and the new per-bank identity found a real pre-existing bug on its first run. **Seat-design lesson: a perfectly elastic posted-rate window stands in for a market and prevents one forming.**
    - **37.** S10 produced the damper metric §6 asked for: 1,349 instruments persistently bound. A cash-drained bank still bids, because it funds.
    - **38.** WS7 money funds: real liabilities, a front-end bid, a deposit-competition gate on the real yield gap.
    - **39.** WS8 primary market. **Two calibration defects:** every issuer re-announced the week its deal settled — a standing conveyor at 13x the intended flow.
    - **40.** G2: itemized business loans with named borrowers, real interest, capital-gated priced origination, loans creating deposits, M2 as a derived sum (`deposits + reserves × 0.1` — a tenth of a phantom 1e12 scalar — deleted).
    - **G2's transmission, measured end to end (+300bp, A/B):** quoted margin 582 → 857bp, SME origination −51.3%, segment capex −21.5%, category demand −0.66%. The first build moved origination 0.5% — priced correctly and inert, because demand was a pure quantity target. Borrowers now carry their own hurdle and borrowed money FUNDS REAL CAPEX.
    - **Two identity lessons caught by the invariant, not by reasoning:** corporate deposits are a reporting VIEW, not a bank liability; and a facility draw is therefore a real cash outflow from the lending bank.
41. **HC Wave 2 — the private sector has a lifecycle.** Five defects stood between "the code is written" and "deals happen", each a different way of building a market that could not transact:
    - Deal intent died every week (marked with `pending*` fields stage 08 rebuilds from an explicit field list): 767 offering-weeks that could never settle. **State that must survive a week has to live on an object something owns.**
    - A debut could not be priced — the engine returned early on zero outstanding float, which is exactly a first-time borrower.
    - Demand was sized off the PRE-issue float, so no offering could be absorbed at any price.
    - The weekly cash budget was split across the whole STOCK: a book that could HOLD 53.7M could only FUND 14.0M, running the solve to ~1365bp against a sponsor who walks at 900.
    - Dry powder was read as the sponsor's `cashUSD` — 0.01B across every fund in the world. **A fund does not hold its investors' money, it CALLS it.**
    - The private mark was a bare `8 ×` in three places. Now `publicComparableEvMultiple`.
    - **Measured (120 weeks):** 295 LBOs closed, 317 pulled at the sponsor's own walk-away; peNAV 25.0B → 8.0B as comps de-rate 8.0x → 3.5x. **Zero IPOs, honestly** — nobody lists into a market that has de-rated by half.
42. **Call protection, and the death of the free call.** An issuer retired a bond at PAR the moment its coupon sat 1% above market — an option no lender writes. Three real regimes: SOFT_CALL on loans (101 for six months — floating paper exposes the lender to spread, so what is protected is the spread underwritten), HARD_NC on high yield, MAKE_WHOLE on IG.
    - The make-whole spread is what the holder needs to replace the bond: the dealer's bid-offer, one constant read by both 07b and the make-whole.
    - **Accretive calls fell to 0.00B.** For an IG bond the premium IS the present value of the saving, so a purely rate-driven call never clears — which is what a make-whole is designed to do.
    - The delever path retired the NEWEST (most protected) tranche first, and prepayment make-whole'd long bonds. Ranking by rate given up per dollar of call cost: premiums 1,388M → 0.9M. One wrong turn: gating par-callable paper on the same test cut prepayment 97% — retiring debt that costs nothing to retire needs no arbitrage.
43. **The take-private, and an honest answer to "does LBO activity lift equity multiples?" No, and it structurally could not** — a sponsor could only buy PRIVATE firms, and the one effect that registered ran BACKWARDS (capital calls drain the cash that funds institutions' equity bids).
    - HC6c screens LISTED companies with the control premium DERIVED: to buy every share you must clear the reservation of the holder who values the company MOST, not the marginal one who sets the printed price. **The sponsor bid appears when equities are cheap**, because a lower price means a smaller equity cheque.
    - A bug the measurement caught: `applyPendingCorporateActionSettlements` drains its maps at the end of stage 08 and `hc-lifecycle` runs after, so the tender's cash leg went into a map nothing read — the register was extinguished and shareholders were paid NOTHING.
    - **Measured (90 weeks): 36 take-privates**, institutional equity buying power +8.9% with PE. **The multiple effect is NOT clean and I will not claim it is.**
44. **ETFs — real indexes, real index funds, dealers as APs.** 27 funds born EMPTY: seeding a share stock would invent the flow the mechanism exists to produce.
    - **The one demand shape the engine could not express:** an index fund buys its benchmark weight at whatever the market asks — a SIZE with no reservation. Getting it wrong is instructive: a PRICE_LIKE reservation is a MAXIMUM, so "no reservation" is an unreachably HIGH one; set to zero, the equity funds bought nothing at any positive price.
    - The AP constraint had the wrong basis first (a fraction of dealer equity → 95–98% of flow unabsorbed forever). An AP does not WAREHOUSE a basket; its capital limits turnover. And a region's dealers share ONE balance sheet.
    - **The residual is NOT called a premium.** An early version divided unabsorbed flow by the fund's own NAV and printed a **173% "premium"** — what naming a pressure like a price looks like.
    - Research capacity scales SUBLINEARLY: linear-in-assets says a firm with a hundred times the assets has a hundred times the analysts. At a cube-root exponent, fund AUM 13.6B → 53.5B and all four small-cap funds came alive.
    - Credit funds bid in the PRIMARY; equity funds buy at INCLUSION — which is why they are famously absent from IPOs. Falls out of the rebalance with no special case.
45. **The household sector is the largest fiction left, found by asking who buys ETFs.** At week 40, **household equity 2,224B against a total market capitalisation of 1,052B** — households held 2.1x the entire market. `equityHoldingsUSD` was seeded at `income × 1.5` and multiplied weekly by a formula return, in no register, clearing in no book, while driving net worth, the wealth effect and consumption. **Do not reconcile by injecting the stock. Where an aggregate stands in for a sector, check its SIZE against the real market before trusting anything cleared against it.**
46. **L — the ledger integrity batch.** A retired tranche scaled holders' notionals down and paid them nothing (L1). L4 deleted the last formula price-setter for a listed cohort and immediately exposed #18 as a 40x P/E on a hedge fund — **a formula masking a defect is the argument for deleting formulas.**
    - **L7 did not reproduce, and why I first thought it did is the lesson.** My probe found a 9.8% jump at the recorded week and magnitude with the wrong SIGN. It was an artifact: I summed cash as `Math.max(0, cashUSD)`, hiding exactly the entities the event was about. Unclamped, +3.10B (0.3%). **A measurement that clamps is a measurement that lies, and it lied in the direction that made a story.**
47. **MS1 — households own real things.** `equityHoldingsUSD` is a sum of real holdings: index-fund shares created through the real AP mechanism, the listed float institutions do not own, and **founder stakes in the private tier**, invisible until now. All four ALL_CAP funds 0/4 → 4/4 live; fund AUM 53.5B → 97.8B. **A household runs no research desk, so the coverage rule already made it a 100% indexer — the buyer was specified before it existed.**
    - The remainder is NAMED, not deleted: marking households down to what exists would import §7.18's shortfall straight into consumption — fixing a local inconsistency by making the macro worse.
48. **The household sector was modelled an order of magnitude more thinly than the corporate one, and naming a gap is not closing it.**
    - **46% of the "unmodeled" 1,605B was not missing from the world — it was UNATTRIBUTED in it.** Insurers held 495B against 40B of their own equity; pensions 146B against 17B; managers 188B against 31B. **740B was a liability to somebody and nobody held the claim.**
    - Households carried 1,061B of mortgage debt and owned no house.
    - **Why I got it wrong:** naming the gap made MS1 *attributable*; it did not make the model *right*, and I treated those as the same thing. **Splitting one real thing across two projects guarantees that building either alone leaves a gap to name** — the claim linking a household to a pension fund is simultaneously the fund's liability and the household's asset.
    - **Lesson: when a number has to be labelled "unmodeled", check first whether the model already contains it somewhere it is not attributed.**
49. **HH1a — the harness went green for the first time, via a defect misfiled for a year.** 740B of claims exist on both sides; the placeholder fell 1,759B → 964B on attribution alone.
    - **#18 was never a revenue runaway.** The four names flagged for a year were the four regional HEDGE FUNDS, whose revenue is a fee on their book. And they had not grown: **their book SHRANK 76.8B → 62.4B while reported revenue rose 29x**, because the generator seeded `aumUSD` from an operating company's revenue. A §7.4 cold start wearing a growth defect's name. 29x → 1.1x, zero violations.
    - **The tell was available the whole time:** always week 60, same four names, no new ones — a step change compounding, not a process running away.
50. **Every non-financial corporate is the same firm.** Four sector coefficients over 2,004 companies that all produce storable units, hold inventory decaying at a hardcoded 2%, and run one COGS decomposition. **Enterprise software sits in physical inventory, spoiling like steel.** No subscription, backlog, deferred or royalty revenue anywhere.
    - **The model already knows operating models differ and applies it to exactly one sector.** That asymmetry is the tell, and it sat in plain sight through every project touching stage 08.
    - **A topic can exist, be correctly named, and still not contain the thing you filed under it.** IND's fields were all balance-sheet policy, nothing about revenue, costs or inventory.
51. **HH1b — one insurer, not two.** The INSURER branch refused to read its own entity on reasoning that predated S11. What it produced was a shell reporting 0.05B of revenue beside an entity holding 241.4B, with `technicalReservesUSD` printing 0.2B against a 221.9B beneficiary liability — the same obligations twice, three orders of magnitude apart. Market cap 0.10B → 51.0B. **A refusal outlives its reason; re-check the comment that explains why something is not read.**
52. **HH1c — somebody pays the premiums, and two hurdles stopped being constants.**
    - **A leak built in deliberately, then closed.** The first version zeroed the insurer's operating expense to avoid an unfunded outflow. **Writing `* 0` with a note is a fine way to defer a decision for an hour; it is not a fine way to ship one.**
    - Two constants retired into the metric each industry actually uses. An insurer's hurdle is its **cost of float** — measured −1.57%, so the float is FREE and it accepts **7.43% where the constant said 9%**. A pension fund's is its **funding need**: 4.38% at 107% funded against a stated 7%, and an underfunded one needs more — "underfunded schemes reach for return", falling out of arithmetic.
    - **The other three stay stated, and that is the honest answer.** A manager's hurdle is its investors' benchmark, a fund's its mandate, a sponsor's what it underwrites to. **Deriving them anyway would be a formula wearing a derivation's clothes** — the failure mode this project is most at risk of once deriving things becomes the habit.
53. **HH2 — the house joins the balance sheet, and a units error hiding behind a small number.** The stock is physical units × the cleared median price. Net worth 1,543B → 4,730B, net-worth-to-income 1.5x → 4.61x.
    - The wealth effect read `(netWorthToIncomeRatio − 1.0) × 0.006` — a LEVEL feeding a GROWTH rate. Invisible while wrong-and-small (0.3% at 1.5x); at 4.61x the identical expression added **~1.9pp to real consumption growth every week, forever**.
    - **Lesson: a dimensionally wrong expression scaled by a small input looks like a tuned constant and passes every check.** Every place a level multiplies into a rate is a latent version of this.
54. **Task-list mapping.** S ↔ audit findings + #67/#18/#34; WS ↔ #68–82; MS ↔ #56/59/60/52; BP ↔ #58/45/48/50/51/54/55/64; AU ↔ #66.
55. **HH3 — household debt joins the banks' books, and #67 dies of realism.** Households owed 0.95x income evolved by paydown constants, banks held a scalar chasing 11.67% of it, and the other 88% was owed to nobody. Now mortgage/card/term POOLS on each named bank.
    - **Amortization is ANNUITY ARITHMETIC on each pool's own terms**, which killed the 0.0004/wk constant.
    - **#67 CLOSED by re-measure:** USA bank capital was collapsing to zero by week ~70; with the real book it runs 11.6% → 14.7% through week 80. The collapse was the fictional consumer book.
    - Under tight policy the card and term books SHRINK (42.9B → 33.5B) while measured debt service climbs 17.8% → 26.6% of income.
56. **HH4a — the household cross-section, at zero aggregate cost.** ~14 occupation × wealth-tier cohorts per region, built from the same primitives the aggregate uses, so Σ cohort disposable equals the aggregate by construction.
    - **The normalisation discipline is the design.** Every per-tier propensity is a RELATIVE weight renormalized against an aggregate the sim already runs on. **Result: 40-week aggregate paths bit-identical to the pre-cohort world.** A cross-section that moves no aggregate is the only kind that can land safely on a running simulation.
57. **HH4b/c/d — the budgets bite, wealth gets an owner, deposits get one representation.**
    - **HH4b.** C = Σ cohort budgets, with debt service debiting and capital receipts crediting — both sides at once. Receipts run in three components because incidence is the economics. **The first draft allocated everything by equity exposure and handed 46% of the recycle to the top 1%**, inflating luxury demand a quarter over its seed weight — caught by measuring derived spend shares against their calibration, not by the harness. At the week-60 squeeze the G1b escape's terminal inflation is ~11pp LOWER than baseline.
    - **HH4c.** Tier net worth is a split of the marked aggregate, summing exactly; the wealth effect is tier-weighted (0.10 → 0.015), making a housing move worth ~2x an equal equity rally — an asymmetry a single constant cannot express.
    - **HH4d.** `depositsUSD` is household money; the 418B of wholesale funding it silently carried is its own line. **The reconciliation invariant found TWO pre-existing defects on its first runs:** bank M&A stranded the acquired bank's entire balance sheet (54B of UK deposits vanished in one week while households still held the money), and the revenue-growth ceiling read growth-by-acquisition as organic. **A conservation invariant pays for itself the week it lands.**
58. **HH5 — the labor market becomes a market, and a third unemployment rate nobody knew about.** The plan said two representations. There were three: the GDP-gap formula (4.5%), the pools (8–17%), and **`unemploymentRateBottomUp`, written every week and read by NOTHING** — printing 37% against a full-employment economy. **Dead state can be wrong for years precisely because nothing reads it; grep for the readers before trusting a field.**
    - Employment has ONE representation — the employers' books — reconciled again at the END of the week, so a bankrupt firm releases its staff the same week.
    - **Stage 08 was overwriting the market every week:** its `headcountPressure` drift still ran after matching had settled (pools drifted 3.9% above the books by week 43). **When a new stage takes ownership of a quantity, the old writer must be deleted in the same change.**
    - Three shape errors: labor demand as a LEVEL ratio drifted until every firm wanted 29% more staff while real GDP was flat (a growth-on-growth form has no level to drift); matching efficiency GUESSED at 0.62, implying every opening filled inside a week (derived, it pins time-to-fill at six weeks); unfilled vacancies never expired, so an occupation nobody could staff accumulated 186k openings against ONE seeker.
    - **Two §7.4 cold starts.** Opening the vacancy stock at ZERO made it climb from nothing for forty weeks while unemployment also rose, so the Beveridge relation printed **+0.94** — an artifact that looked exactly like a broken labor market.
59. **HH6 — a wage somebody decides.** Firms set their own offer from unfilled postings and margin headroom; the going rate is the employment-weighted average; quits respond to relative pay. The region-level tightness→wage formula walked an index no employer's payroll referred to.
    - **Stage 08 rebuilds every company from a fixed field list**, so anything in `companyUpdates` not named there is silently dropped — the wage fields were, and so were **private firms' headcounts**: the whole hidden tier posted vacancies, consumed real matches, then reverted every week.
    - The first wage rule blended a level against a scaled copy of itself, delivering **t × 0.06** — six percent of the intended move. **A relative index is not a growth rate:** compounding a 2% premium weekly is 180% a year.
    - Cost of living deliberately partial (0.6): full indexation makes the real wage constant and the model a mechanical spiral.
    - **Verify by lag, not by level.** Contemporaneous wage~tightness reads −0.10; unfilled share LEADS wage growth 0.08 → 0.41 → **0.71** at 1/4/8 weeks. **A channel with a lag is invisible to a same-week correlation.**
60. **HH closed — the recession transmission, demonstrated.** Killing the largest USA employer (207.4k jobs) against a same-seed control: unemployment **+1.62pp** within a week, consumption **−1.41%** by week 2 and **−2.16%** by week 4.
    - **It found a defect nothing else could see:** equity prices run away past ~week 80 (median 7.9 → 5,048 by w120 against EPS 0.39 → 0.57). **Making a sector real makes other sectors' defects visible.**
    - HH4b damps the inflation escape ~11pp and HH6 amplifies ~15pp — the household channels push both ways and neither is the stabiliser. All of it wants PUB.
61. **PUB1a — the government pays its interest.** Interest is computed off the real stack and taken OFF THE TOP, so debt service crowds out the primary budget rather than being added to a deficit that already includes it. Interest 10.4% → 12.6% of spending as debt/GDP runs 108% → 171%. **Only 52% of the bill reaches a modelled holder**; the rest is named rather than netted out, which would understate the burden.
62. **PUB2a — the central bank gets a balance sheet, the treasury gets an account.** Two scalars retired (a phantom 1e12 reserves figure beside real per-bank cash; a balance-sheet GDP ratio drifting on a stance multiplier). **The TGA is the mechanism** — a treasury account is a CB liability, so filling it drains reserves and spending returns them.
    - **Two lessons, both about posting a leg twice.** Banks were already credited their sovereign coupon to cash AND equity; crediting reserves again broke the per-bank sheet by exactly the coupon. And the TGA was debited by every deficit and credited by no financing at all, running to **−40.3B by week 60**: a treasury account without issuance proceeds is a cash flow with one leg.
63. **PUB1b — tax is collected from real payers.** The fiscal block thought it collected 25% of GDP while the modelled bases support ~50–60% of that, because **there was no consumption or payroll tax anywhere**. Named rather than closed by shrinking the state, which would model a different economy.
64. **PUB1c — the two missing instruments, and taxes stop being weekly.** An employer payroll tax carved out of total compensation and a consumption tax as a wedge inside the cohort budget. Real collections **~50% → 99–100%**.
    - **Periodicity is part of the number, and "weekly" was the tell** — households and SME pools were remitting every week, which no tax authority does. Every stream now has its own calendar.
    - Two bugs the calendar exposed: `currentWeekMod13` runs 1–13 and never 0, so a quarterly trigger written against `=== 0` never fired and 5.35B accrued unpaid; and with receipts lumpy and outlays smooth a 4-week operating balance ran the TGA negative by week 10.
    - **Capital income is not derived from wages** — splitting the wage bill for payroll tax shrank it too and the S1 assert fired. Capital income is a share of OUTPUT.
65. **PUB1d — the auction stops being a forced take-up, and a workaround outlives its reason.** Stage 11 PLACED each new issue on existing holders pro-rata with no affordability check. Its stated reason was real when written; S11's budgets and §7.21's saturation clearing retired it and nobody went back. The fix was a deletion: the issue exists, 07c prices the enlarged bucket, and the dealer holds what finds no buyer — **which is what an undersubscribed auction IS.**
    - Bank reserves at w40 **−29.0B → +84.7B**; the 2Y at w26 **0.98% → 2.62%**; dealer residual 123B — a real primary dealer's inventory.
    - **A refusal outlives its reason; so does a workaround.** Both need a date and a condition in the code that says what would retire them.
    - A mis-attribution corrected: PUB1b blamed a 50.3B fall in institutional cash on this path; the A/B disproves it. **Two defects that move together are not one defect.**
66. **PUB2b — the balance sheet becomes a quantity, and a pledge that outlived its bond.** The CB was the one holder that never got repaid: its book sat frozen at its seeded 100B while the tranches behind it matured, and its share drifted **15.0% → 11.4%**. Now redeemed pro-rata and placing an **open-market order** 07c/07f price.
    - The order is a size with no reservation — the index-fund shape. What is unique is the CASH leg: it pays with reserves it creates. That is not a shortcut; reserve creation is what a central-bank purchase IS.
    - Three regimes all fired in one 60-week run. Book **100B → 137B**, share **15.0% → 16.9%**, remittances negative when policy exceeded the portfolio yield.
    - **A pledge that outlived its bond:** every bank failed the collateral invariant at w51 because maturing pledged paper never released its encumbrance. **A new participant is a good way to find out what the old ones were getting away with.**
    - **Sized by a cap, not by a fit.** Unbounded, a deflation deep enough to want −5% ordered 40% of the stock a year and cleared the 2Y at **−2.6%**. Capped at a real announced run rate, QE gives a 2Y of 0.84% against 2.28% under forced QT. **The cap is a fact about central banks, not a knob turned until the output looked right** — the only kind of constant allowed to fix a number.
    - Forced-QT A/B at w40: book 136B → 86B and the 10s2s slope **210bp → 79bp**, through real absorption. No term-premium formula anywhere.
67. **PUB1e — four answers to "what does the government buy", and a bid that lost the auction.** Rule 3 four times over: stage 03 allocated G by buyer mix with a stance multiplier, stage 05 re-derived a slice off a smoothed level, the GDP identity used a third formula, and the treasury was debited by none of them.
    - **The government's purchase had no cash leg**, and `isGovernmentAggregate` was set and never read — the tell that the buyer side was never built.
    - **A sweep tells you which half of a gap is yours.** Fill ran 38–63% of budget under a +10% price cap; sweeping the tolerance, unspent 0.81B → 0.54B → 0.36B → 0.21B, **flat after +50%**. Half the shortfall was willingness to pay, half is the goods market rationing everyone pro-rata.
    - The right constraint is the appropriated DOLLAR budget, not a price cap: inflation then erodes real government purchases on its own.
    - ~25% of the budget cannot be filled at any price. Households have always been rationed the same way; this is the first buyer whose unfilled demand has a cost.
68. **PUB CLOSED — the close-out battery.** Every §5-PUB criterion passes at 120 weeks.
    - 67.6% of the USA's 4.1B/wk coupon bill lands on a named book, up from 52%.
    - corr(interest share, realized procurement) = **−0.833**. Quadrupling the coupon takes real procurement **−43% to −58%** and debt/GDP 152% → **211%**.
    - corr(policy rate, remittance) −0.762 in levels, **−0.547 in changes**. **A response is a correlation of changes, not of levels.**
    - A correction: PUB1d's "no negative yields anywhere" was measured at w60 and does not survive to w120.
    - **What it found that nothing else could see:** the TGA runs to 1,188B; `unbackedBankCashUSD` flat to w52 then **2,183B by w120**; procurement fill falls to 7.7%; all four regions print the 2Y at 39.84–39.86% — four independent economies agreeing to two decimals is the damper binding, not a market.
    - **The first write-up said 306.6x against 12.2x and was wrong** — it compared 4-week sums of a quarterly-lumpy series at its endpoints. On trailing-52wk sums it is 1.3x. **A lumpy series has no endpoints**; the battery now refuses the comparison below 104 weeks.
    - **A close-out battery is not a longer harness run, it is the only place a project's own criteria get measured.**
69. **PUB3a — nobody was paying the government's staff, and households were paid twice.** 1.65M USA government employees earn real wages inside the labor share (**8.1% of GDP**) and the budget had no compensation line, so households were credited the same ~8% of output twice — once as wages, once as a transfer.
    - The fix is a carve-out, not an addition. Household income **513.7B → 470.6B (−8.4%)** — income nobody was ever really owed.
    - **It found a second seed that overwrote the first.** `simulation/initialization.ts` recomputes household income after the macro bootstrap and was omitting both carves — a PUB1a leftover that had silently won for six slices. **When a number matches neither branch, look for a third writer.**
    - A side effect worth more than the fix: unspent procurement at w120 **22.7B/wk → 1.3B/wk**. The row blaming the goods market was measuring an oversized budget as much as a short market.
70. **PUB3b/3c — the budget becomes a sum of real obligations, and a reverted change that should not have been reverted.** The deficit is an OUTCOME; the automatic stabiliser is real with it.
    - The bases calibrate: the implied benefit lands at **51–53% of the average wage** across four independently-sized regions, inside the real OECD band.
    - **The judgment error, recorded because it is the lesson.** The first attempt took the TGA to **−497.5B** and I reverted the spending path. That was wrong. **A negative treasury account is not a fiscal outcome, it is a missing instrument** — the invariant was pointing at the financing and I deleted the diagnosis instead of building it. PUB3c's cash-management bills bridge the quarterly auction gap: TGA negative in 0 of 480 region-weeks.
    - **THE FIXED ENVELOPE WAS MANUFACTURING CROWDING-OUT.** The debt-spiral shock used to cut real procurement 43–58% on impact; it now cuts 0.0–4.2%. A real government facing a rate spike borrows, it does not cut pensions that quarter. **An impressive number can be an artifact of the constraint you imposed.**
71. **PUB3d — bills become real discount instruments, and a rename that admits the code.**
    - **The CMB that wasn't.** The bridge was called a cash-management bill but issued into the same programs at the same weights and prices. A real CMB exists because a real bill calendar is FIXED; this model has none. **A name that claims a distinction the code does not make is a lie the next reader believes.**
    - **Bills paid coupons.** Issued at PAR *and* paying a coupon. That was correct in NET, which is why nothing looked broken — but discounting the proceeds while keeping the coupon would have **doubled** the cost. Four legs had to move together.
    - **The catch, reported rather than fixed silently:** the reported interest line HALVED (14.7B → 7.3B/wk) because bills are now cash-basis. That is not a saving; the cost moved to redemption, and the discount accruing beside it is **8.1B/wk, larger than the entire bond coupon**. **A number that halves after a refactor is a claim to check, not a result to report.**
72. **XB1/XB2 — ownership stops being a parameter, and the hedge decides who buys what.**
    - **`foreignShare` deleted:** it assigned each region a share of every other's markets and was subtracted from the float in all five books while owning nothing — **442B of claims with no holder**, against 883B of institutional assets in the whole world.
    - Measured foreign ownership of USA markets, now an output: equity **16.8%** (imposed 15%), corporate **20.0%** (12%), sovereign **16.2%** (24%). The sovereign gap is the 442B-vs-883B arithmetic coming true.
    - **Cross-border flow chases the spread over the LOCAL short rate, never the headline yield** — under CIP a hedged foreign bond reduces to term spreads, so a 15% bond in a 14% policy-rate country is worse than a 4% bond in a 1% one, and nobody had to be given that preference.
    - **Two defects it took building this to find.** A stable-NAV fund's shares only moved on subscriptions while its assets grew by everything it earned, so book and shares diverged without bound. And 07b/07d swept every corporate holding into whichever region's auction was running. **A constraint that only holds because something else is binding is not a constraint.**
73. **XB2b — a derivative has a supplier, and the cross-currency basis is what that supplier charges.** XB2 let any hedger strike a forward at pure CIP in unlimited size — an infinite supply of derivatives, the same shape as every formula this project deletes, except the thing assumed away is a balance sheet.
    - Three real costs, all quantities: a PFE add-on against leverage capacity, internalisation before carry, and initial margin as cash AND a liability.
    - Calm against a dealer-equity shock of −65%: capacity used **3.2% → 100%**, basis **4.9bp → 150bp**, hedged share **74% → 57%**. A liability-driven insurer pays up to 220bp; a hedge fund quits at 45bp.
    - **A sign error worth recording.** Pricing the basis the wrong way hands the hedger an instant gain at inception; bank NIM went to **−2.2%** before it was caught. **A cost modelled with the wrong sign is a subsidy, and it looks like a working feature until someone reads the P&L.**
    - It does not bind in calm conditions, and that is correct. **A constraint tuned to bind always would be modelling a permanent crisis.**
74. **XB2c — the desks actually trade, and real flow anchors the currency.**
    - **The sign was backwards and only survived because nothing read the direction** (`crossCurrencyBasisBps` reads `|net|`). **A sign nothing consumes is not verified, it is merely unused.**
    - The delta hedge is real flow: −26B USA, −28B EUR, −21B UK, −19B JPN per week, with ~63B still carried because a desk works a position rather than dumping it.
    - **It anchors the exchange rate, which was the surprise.** EUR/USA runs 1.499 → 1.475 with the flow and 1.720 → 2.704 without it over 30 weeks. **A market with a real flow in it is more stable than one with only a drift, not less.**
75. **XB2d/2e/2f — FX becomes a market, in three corrections, each found by one question.**
    - *"Who is the desk buying currency from?"* — nobody. XB2d built the market: dealer inventory, cross-border settlement and trade receipts on the inelastic side; hedge funds and central banks on the elastic side.
    - *"How can someone sell JPY to buy EUR if it clears only against USD?"* — they could not. The schedule was built one currency at a time, so a JPN insurer buying EUR bonds registered euro demand and **no yen supply**. **Building a two-sided flow one side at a time is how a leg goes missing.**
    - *"Is this actually a clearing-price auction?"* — it was not. `move = −netDemand / totalSlope` clamped at 8%/week, parking the rate on the clamp: the "a bound is not a price" error re-committed in a new market.
    - Five invented constants deleted, including `FX_DELTA_HEDGE_EXECUTION_RATE` — a claim that a desk could work only 60% of its position, a liquidity assertion with no liquidity behind it.
    - **A large pre-existing bug this exposed.** `getFxToUsd` looked pairs up by labels this model never builds, so every lookup missed and **the one function converting to USD had never returned a real rate**. Nothing now matches on a label, which is what let the mismatch hide.
    - Triangular consistency by construction: what clears is each currency's value against the USD; three cleared values cannot violate arbitrage where four drifting pairs could.
76. **XB3a — a good has a world price: built, then HALF REVERTED, and the reverted half is the lesson.**
    - **`CATEGORY_TRADABILITY` is a real-world EQUILIBRIUM**, the observed trade share of a category — not a primitive. Splitting supply by it imports the answer. **A parameter can be perfectly real, perfectly measured, and still be the answer rather than an input: the test is not "is this number true" but "is this number a RESULT of the history I am simulating".**
    - **The invoice-currency half was worse.** Three invented weights and an argmax — a formula wearing a mechanism's clothes. It locked to 100% USD by week 5 because one invented weight exceeded another's reach. **I recorded that corner solution as a finding about the world; it was arithmetic between two of my own numbers.**
    - What stands: the per-firm settle-ONCE restructure across books, the global counterparty lookup, trade as accounting from the auction's own lots (world exports = world imports to the dollar), and seeding by RUNNING the engine on a structural copy and restoring the RNG.
77. **XB3a rebuilt, XB3b, XB5 — tradability became an outcome.**
    - Replaced by physics: value density per tonne, real distances, three delivery modes. **Spearman(value density, −freight as a share of value) = 0.897** — the denser the value the less distance matters, with no table saying so.
    - **The physics carries a result the old table could not state.** A domestic American road haul costs $19.24/tonne against $3.45 for a transatlantic crossing — 5.6x over a quarter of the distance, because a truck burns seventeen times the fuel and carries three thousand times the crew per tonne-mile. That is why globalisation happened.
    - **XB3b: money had a currency and nobody had applied it.** Compared raw, the lowest-price-level region undercut everyone on every good. **That is not competitiveness, it is a missing conversion**, invisible only because nothing had ever compared two regions.
    - Four defects found by running it rather than reasoning about it, the worst being the pipeline carry charged at the goods market's 2%-a-WEEK physical decay rate, which **defaulted the entire carrier fleet by week twelve**. **Two rates called "cost of holding stock" were eight times apart: name a rate for what it MEASURES.**
    - **A running economy's pipeline is FULL.** Seeding it empty starved importers for a month.
    - XB5: the central bank had been intervening with its DOMESTIC BOND BOOK. Real FX reserves now, and a bank at zero simply stops bidding — which is what makes a defence fail.
78. **The optimisation pass, and the determinism it found broken.** 1,793 → 1,311 ms/week, byte-identical. All three wins were the recorded anti-pattern: work recomputed per item that should be computed once.
    - **The real find: same-seed runs no longer hashed alike, and it was not the RNG.** Three sites wrote wall-clock `new Date()` INTO GameState, so every run differed at week 0 by the operator's clock — and the first A/B "showed" the optimisation changing the world when it was measuring clock noise.
    - **A determinism guarantee is only as good as the check that would catch its decay.** The A/B hash is that check; any optimisation claim without it is a claim, not a result.
79. **Optimisation passes 2–4: 1,793 → ~1,000 ms/week, and the solve became exact.**
    - Bit-exact passes driven by function-level profiling, each verified against a 25-week full-state hash.
    - **The solve is EXACT now.** Total demand is piecewise linear, so the level is computed by one segment walk instead of 60 bisections. Property-tested on 20,000 random schedules: worst relative difference 4.1e-13. A world relabel of the gentlest kind.
    - **Two profiler lessons.** tsx flattens every function to line 1, so V8 profiles cannot attribute inside a stage — temporary section timers can, and did. And the profiler ATTRIBUTES INLINED CALLEES to their caller: 105 ms/week of "self time" bought only ~25 when replaced.
    - The frontier: ~1,000 ms is near the bit-exact floor. Sub-300 needs worker parallelism plus stage restructures that reorder floating-point accumulation — both world relabels, both SCALE's.
80. **Worker-thread clearing, and the 300 ms question answered.** `clearFinancialAsset` is pack → kernel → accumulate over flat typed arrays, shardable across a synchronous worker pool; serial and worker paths are one kernel and hash byte-identically.
    - **Why ship-the-objects died first:** a structuredClone of the companies array measures 328 ms PER COPY. **Packing is not an optimisation detail; it is the only door.**
    - Three build lessons: never `Atomics.wait` unbounded (a worker that failed to start hung a 15-second run past five minutes); tsx's resolver inside workers cannot follow extensionless relative imports; and the profiler attributes inlined callees to their caller.
    - **The measured wall:** of ~942 ms/week, every remaining millisecond lives in serial walks of the OBJECT GRAPH, and the clone numbers say why workers cannot touch it. **Sub-300 requires the state itself to move to columnar typed arrays** — SCALE's.
81. **Columnar-state wave 1: 946 → ~850 ms/week, byte-identical.**
    - **The holdings store.** Five books swept every entity's ~70k rows once per region per book — twenty sweeps a week. One sweep now. The subtle parts that made it byte-identical: claims use EPOCH semantics, and 07f claims at APPLY with a different predicate than its extract reads.
    - Stage 08 updates companies in place, removing the last whole-graph copy point (2,600 tenured ~150-field snapshots a week).
    - **Two honest nulls.** `for..of` on the 74k-contract loop measured ZERO — the ~38 ms the profiler put on the loop header was inlined body work. And a WeakMap lot-value cache always missed because the arrays are replaced weekly.
82. **The FX mechanism sweep — four user questions, four findings.**
    - **The trigger-happiness was a sign error, not a threshold.** The CB's reservation was placed on the WRONG side of the market, so the moment its currency slipped it stood fully in the money, every week (60 of 60). **No threshold constant can gate a bid from the wrong side of the price.** Rebuilt as defence only, with the reservation DERIVED: intervention begins where private absorption ends. USA 0 of 60 after.
    - **Reserve accounting was one-signed and side-inverted, and fixing it ARMED the reservation bug** — a backwards bank correctly credited compounded 17B → 2,443B of "reserves" in sixty weeks. **Two defects masking each other; the first fix alone built a money pump. Fix a mechanism only together with the accounting that constrains it.**
    - **FX was a dealer market with no dealer.** The residual was a statistic; it now lands on the same desk book, consuming capacity.
83. **BP1a — the industry registry exists, and the boat probe found the next wall.** One registry owns label, buyer mix, price tier, physics, capex basket and commodity links; the eight legacy tables became derived views, world byte-identical.
    - **The rule-17 acceptance probe:** one temporary `recreational_marine` entry. Demand passes whole — households bid 9,102 units/week — but **ZERO producers**, because the generator assigned lines from hardcoded per-sector templates. That is BP1b's charter.
84. **BP1 closed — the registry owns the data, profiles own the behaviour, one entry is one product line.** The generator DEALS lines from the registry: each industry declares its producing sector, and firms take the sub-units their sector under-serves most.
    - **Rule 17 demonstrated end to end.** The boat entry went from 9,102 units/week of demand and ZERO producers to **32 named producers supplying 2,179 units/week** in all four regions, from one entry with no other edit.
    - **Coverage was a real defect, not just plumbing.** Public-producer coverage 17/28 → **28/28 sub-units in every region** — a third of the economy's categories had demand, prices and household bids with no domestic producer at all.
    - Close-out 47 violations, **41 of them ONE bank story** (26 NIM + 15 capital ratio).
85. **IND1 — what a good physically is, on both sides of the balance sheet.**
    - **Holding.** Carrying cost is derived from physics already in the registry: warehouse rent per TONNE means cost per DOLLAR is `WAREHOUSE_USD_PER_TONNE_YEAR / valueDensity`. **§7.50 is closed — digital output inventory is exactly 0 units**, where enterprise software used to sit in a warehouse spoiling like steel.
    - **Buying — the lot leak fixed at the root.** `purchaseKindOf` routes each purchase to what it physically is. **Input lots at w10: 112,598 → 1,017**, residual growing ~150/week against ~12,000/week of immortal dead lots.
    - Investment became supply-constrained: PP&E grows by capex DELIVERED, not by a budget approved.
    - Close-out 71 violations, **64 the same bank story**. IND1 did not break the banks; it made an already-top defect worse, which is itself information.
86. **The bank cohort, diagnosed — and the deepest "1$ is 1$" boundary found by asking whether a company's cash is anywhere.**
    - Fixed: wholesale funding was frozen at its seed value forever, so banks paid policy-plus-spread on funding they no longer needed. Fixed: firms born after the seed had no bank at all. Fixed: the lead bank on a deal was a second hash rather than the relationship.
    - **Disproved by measurement: corporate deposits are not the banks' missing funding.** Total corporate cash is 57B against an 826B book (7%), and attempting it broke the identity in all 1,012 bank-weeks — because **the cash does not exist inside the banking system.** That is the honest answer to "does one dollar equal one dollar": for corporate cash, no.
    - **Do not tune the bank.** A number that looks like one sector's defect can be another sector's missing mechanism, and the identity tells you which.
87. **SETL1 — the settlement layer exists.** Instructions in, netting, deposits moved on named banks, each bank's residual in reserves. Two residuals computed rather than assumed (unresolved money, the CB identity) and both zero.
    - What the sweep found: **dividends leave the payer and arrive nowhere**, and **coupons are computed twice** — the issuer pays on 100% of principal while holders receive only on what they hold, and the difference goes nowhere.
88. **SETL2 — corporate cash is somebody's liability now.** Every entry in stage 08's ledger is a payment instruction; the walk already named each flow and its amount, and what it never named was the OTHER SIDE.
    - **Asset and liability move in the same statement.** The first attempt moved reserves at settlement while the deposit line was recomputed from stale cash, and the identity drifted. **Per-bank identity residual 0.0M across all 16 banks, every week**, against 1,012 violations before the asset existed.
    - The boundary is a named account with real reserves behind it, and it can no longer hide because it sits on a balance sheet the harness checks.
89. **SETL2b — a loan creates a deposit: attempted, measured, failed, fixed at the root.** The first attempt reconciled the facility book from tranches stage 08 created a WEEK EARLIER, so loan and deposit appeared seven days apart: **83 per-bank balance violations, 142 total against 59.**
    - The fix: **the tranche's creation IS the payment.** Stage 08 records a credit event where it writes the facility, and settlement books the loan in the same statement as the deposit.
    - **Two stages owning halves of one event a week apart is not a timing detail, it is the thing that makes the event inexpressible** — record the event where it happens, don't reconcile it afterwards.
90. **"Where is the residual coming from?" — the boundary, decomposed, and a double-count it was hiding.** A number you cannot attribute cannot be watched, so every instruction naming `UNMODELED` is now attributed to the flow responsible.
    - **The net is small because the gross nearly cancels:** 323B settled gross over twelve weeks against a boundary net of 28B.
    - **It was hiding a double-count SETL2 introduced.** The money market sweep ran −64B/12wk while the fund was ALREADY credited by its own stage: 64B created in twelve weeks. **A flow whose counterparty is credited by another stage must NAME it — routing it to the boundary does not defer the problem, it duplicates the money.**
91. **SETL5 + SETL3 — institutions bank, securities pay their holders, and the layer starts reporting a defect nobody could see.**
    - SETL5 is the CONSERVATION GATE, not plumbing: with institutional cash on a bank sheet, money created out of nothing breaks that bank's identity automatically. **59 → 43.** Two defects found on the way, including a weekly sheet rebuilt from a FIXED FIELD LIST so both new lines vanished every week (804 balance violations) — the same trap stage 08 documents.
    - **43 → 85, and the cause is not the dividend** (0.08B/week). What the change exposed is that **institutional cash swings 72B → 23B → 32B → 18B week to week** — a residual of the clearing books, not a managed balance. **The volatility was always there; it had nowhere to show until money became somebody's liability.**
92. **The migration carried through — SETL4 and the two boundary categories.**
    - **SETL4 — coupons paid once.** **A payment to a bank on its own account moves reserves AND equity**: it is the bank's income, not a customer deposit. 85 → 67.
    - **Category C — the goods market.** Stage 05 pays per lot and per contract. Routing only the company buyers left sellers credited with revenue nobody paid — a gap this migration created and the next commit closed. 67 → 54.
    - **Category B — wages**, split from other opex by the company's OWN payroll, not a chosen ratio. 54 → 61.
    - **61 violations, zero balance-sheet, throughout a six-commit migration** — the whole argument for having built the gate first.
93. **The two independent quantities, and where the migration actually ends.**
    - Institutional cash is a managed position: a fund runs a cash sleeve and invests the excess, so a balance stops being the residue of whatever the week's auctions did to it.
    - **Household income was two quantities.** The derived inflow is gone and every employer pays. The SME tier's wage bill is the REMAINDER, because the tier keeps no books.
    - **CORRECTION to this entry's first write-up:** the 4e16 explosion was blamed on "two employment measures disagreeing". That was wrong. The code read `employedCount`; the field is `employed`. The read returned 0 and a `Math.max(1, …)` guard turned it into a divisor of ONE — a wrong field name hidden by a math guard, at two sites.
    - **THE LAST TRANCHE CANNOT BE INSTRUCTIONS, and that is a design finding.** The clearing books apply cash deltas immediately because the next book must read capacity net of what the previous one spent; defer them and a fund spends the same dollar in five books. They are settled T+1 with reconciled reserve legs, not outside the system.
94. **"Is that right?" — no. A wrong field hidden by a guard, and half the economy with no books.**
    - **Any `Math.max(1, x)` around a divisor is a place a wrong read can hide** — the guard belongs after the value is known good, not around the lookup.
    - **The private segments are half the economy and have no books:** **47% of USA employment and 49% of revenue**, with no cash, no balance sheet, no bank and no counterparty, paying ~70% of the economy's wages from the boundary. The settlement layer made it impossible to keep ignoring, because everything around them became real.
95. **SEG — half assed, said so, and re-scoped.** The first design gave real books to five hardcoded buckets. Three user questions each answered themselves against a measurement: 14 industries / 36 sub-units against 5 buckets; revenue walked a clamped demand signal that never reallocated between them; four of five buckets, 32% of employment, bought nothing and sold nothing.
    - **Every one of those facts was visible in the code before the first design was written.** The recon looked at how the object was WIRED and never asked whether the object was the right one. **When a plan is to give something "real books", check first that the something is real: banking a fiction carefully still leaves a fiction.**
96. **SEG rebuilt — the SME tier keyed to the registry.** One pool per (region × industry), seeded from each industry's own demand times a real `smeShareOfActivity` (0.78 construction, 0.12 semis). Seven tables deleted, not adapted.
    - **36 violations against a 59 baseline**, zero identity breaks, and the three revenue-runaway violations gone. Pools hold 47% of employment and 47% of revenue — matching the independent audit in §7.94 — and their composition MOVES with demand.
97. **Giving something books is a way of FINDING missing flows.** Three defects surfaced the moment the pools had a balance sheet, none in SEG's own code: carriers, money funds and ETFs banked nowhere (11.7B a week unresolved for the money funds alone); `fx-hedging` rebuilt bank sheets from a stale snapshot, silently reverting every line settlement had moved; and the pools ran cash negative because firms' opex was paid to nobody and households' consumption never reached a goods auction — **their two real customers**.
    - **A book that goes negative names the flow that is missing.**
    - `SME_WAGE_GAP` is load-bearing: paying every pool worker the average charged the tier a wage bill sized by its EMPLOYMENT share against income sized by its REVENUE share, and EUR opens at 58% against 42% — insolvent from week 0, unemployment past 30% by w58.
98. **OWN — ownership stopped being an input, and the clamp hiding a defect fell out.** Six slices: shares are measured off the real books and no engine file reads one; a book's float is its outstanding because **the instrument already excludes what does not trade in it**; a bank's sovereign book is bounded by funding above and a liquidity floor below; household direct equity is a name-by-name residual; `bankMarketShare` is measured; `OWNERSHIP_SHARES` deleted.
    - Harness **88 → 488**, and 357 of the increase is ONE new family: corporate books holding ~13% more paper than exists. **Both invariants read zero before OWN** — but the 0.85 rescale had made ownership conservation pass BY CONSTRUCTION, which is why it surfaced the same day the rescale died.
    - **A carve and an exclusion are the same subtraction, and doing both is a double count.**
    - **Check what a passing invariant is actually asserting.** An invariant a clamp satisfies is testing the clamp.
99. **Banks are not firms here, and the gap has an accounting error in it.** `profileKeyOf` sends a bank to its profile, which returns the whole P&L and SKIPS the operating branch — so a bank has no capex, no PP&E, no inputs, a hardcoded 0.40 margin, and `random() * 0.05 * assets` loan losses. **The part that is a defect rather than depth:** `weeklyPayrollUSD` lives inside that skipped branch while the labor market filters employers on region and active status only, so banks hire, fire and count toward unemployment while paying no wage bill. **Rule 14 applies to flows a dispatch table let you skip.**
100. **The full-codebase review, 2026-08-29: 90 findings, four shapes.** Lessons, each cheap to apply again:
     - **A formula that outlived its mechanism keeps deciding.** Four times the measured replacement existed and sat unused while the formula drove the sovereign rating, revenue, consumption and confidence. **After closing a project, grep for the number it replaced.**
     - **Grep for met exit conditions.** Three files stated their own retirement condition ("becomes an outcome when…") whose condition had since been met. The phrasing is searchable.
     - **A silent default is a dead-code justification protecting a live bug** (five sites).
     - **A comment can assert the opposite of a measurement.** The FX damper documented as "NOT a bound the price rests on" while binding 38 weeks in 40. **Comments about behaviour are claims — check them against the harness.**
     - **An aggregate check can pass while a category screams.** Market shares summed to 646% in one category under a green harness.
     - **Reframing beats enumerating.** Nine imposed household tables are one missing mechanism; five damper prints plus a watchlist row are one thin-demand defect.
101. **One harness.** Five scripts collapsed into `scripts/harness.ts`: one pass every check, battery and the profiler read as modules, one line printed per week. **Fidelity proven before trusting it** — the rewrite reproduced the baseline exactly, including keeping the old harness's dirty-RNG quirk deliberately. **A harness quirk the baseline depends on is part of the baseline: document it and keep it, or reset it and re-baseline everything, but never change it silently mid-series.**
102. **OWN8 — a ceiling that was an accounting identity, and the dead market it hid.** `investableSurplusUSD = funding + equity − loans − cash − repoLent` **IS** the sovereign book by the balance-sheet identity, so the ceiling equalled the position it bounded, to the cent, for every bank every week.
     - A/B: USA sovereign book 78B→350B (fixed) against 78B→53B (broken). Repo borrowed **0 → 46.7B**, 3 of 4 USA banks borrowing, and the SRF drawn for the first time in the model's life.
     - **How it was found is the lesson: not by the harness, but by a user question.** The corridor assertion passed VACUOUSLY for eight commits because with no borrower the session returns the ON RRP floor as a literal. **A market that clears nothing satisfies every check written about its price.**
     - I reached for a residual ceiling because there was no funding market to bound a securities book properly. **A bound on a securities book must be a bound on its FUNDING** — REPO's job.
103. **SETL6 — the clearing books settle through a clearing house, and CASH closes.** Every participant faces the CCP, which is flat by construction because it is on both sides of every trade — so `clearingHouseResidualUSD` must be zero, and a book that settles one side and not the other says so immediately.
     - **The books clear before the settlement pass, so a trade is a PAYABLE until it settles.** `pendingSettlementUSD` is read in three places that would otherwise be wrong, including marking: leaving the receivable out marks every buyer up and every seller down by its own week's trading.
     - Three things the gate caught: `settlementResiduals` was written with SETL1, never called, and had the household sign backwards; the CB's clearing leg had no accounting, so QE now grows the monetary base instead of crediting a seller outside the banking system; and **07f's bank writes had never landed** — it wrote `ctx.updatedCompanies`, which stage 08 rebuilds. **`companyUpdates` is the ONLY bank-sheet write that survives before stage 08.**
104. **OWN7 — the float was the whole issue, and not every holder was in the book. Harness 602 → 107.**
     - `checkHoldingsLedgerConservation` compared the wrong two numbers and had since XB1: it filtered on the HOLDER's region and counted positions regardless of the ISSUER's, and left three real holders off the held side.
     - `checkOwnershipConservation` was right; only its comment was wrong.
     - **THE MISSING SHRINK: the float was the whole issue, but not every holder bids.** The central bank on a week it places no order, and the corporate treasuries, are both outside the book while holding the paper. Sovereign books 114% → 97% of outstanding.
     - The register was counting SME POOL loans as corporate ownership — a scalar on the pool, not a tranche on any company.
     - A merger left the target's paper on its holders' books: 161B held against 131B outstanding on a merger week. Debt rows are re-keyed to the acquirer; equity rows are not, because those shareholders were paid in the tender.
     - **A number that looks like a disease can be a measurement error, and a number that looks like a measurement error can be real. The only way to tell is to make the comparison correct FIRST and then look.**
105. **GUARD — the silent defaults throw now, and two were hiding live bugs.** **(a) No seeded company had a `listingStatus`** — the entire listed universe existed on `undefined → PUBLIC`. **(b) A merger's consolidated tranche had no call protection**, because `consolidateTranches` bucketed by rate type and tenor alone, so a bank facility and a syndicated loan merged and both flags went with the protection — recreating the G2 double-count inside 07d's float.
     - Three dead outputs deleted, one costing a full-universe sweep every week to feed a parameter nothing read.
     - Three invariants, each of which would have caught a defect found by hand: category shares sum to 1; a market with willing participants on both sides must transact non-zero volume (measured BY THE SESSION, not from closing balances); and **a holding ceiling may not equal the position it bounds** — a constraint that binds identically on everyone every week is an identity wearing a constraint's name.
106. **FRM — four formulas that outlived their mechanisms, deleted.** In every case it was the FORMULA a downstream decision still read while the measurement sat beside it unused. No new mechanism: every fix is "read the number that already exists".
     - The sovereign is rated off its own budget; government revenue carries the measurement forward; households spend out of the wage they are paid; **the opening rating is an outcome** (four ASSIGNED real-world labels deleted, rule 4). Regions that open with identical fiscal positions now open at the same rating.
     - Left standing on purpose: the fiscal-stance step function, which needs a government that reads its own budget — behaviour, not a deletion.
107. **The week's cost, measured — 1,139 ms mean, and stage 05 is half of it.** `05-unit-bidding` **538 ms / 46.8%**, more than the next six stages combined; `08` 137 ms; `09-concentration-risk` 98 ms.
     - **Where the other four minutes go:** `npm run verify` runs **243 weeks, not 60** — the shock batteries are three-quarters of the wall clock, which is why `SHOCKS=0` costs 69 s and the full run 315.
     - Measured directly from a separate clock: (69−3)/59 = 1,118 ms/week, within noise of the profiler's 1,139.
108. **IND-R1 and IND-R2 — banks pay their staff, and financial firms stop supplying software.**
     - **Payroll is common to every firm.** It lived inside the OPERATING branch, which banks skip, so the labor market hired and fired bank staff, counted them in unemployment, and no wage instruction was ever posted.
     - **The carrier had TWO payrolls** and the P&L read the one the labor market could not move.
     - `FINANCIAL_SECTOR_PROXY_LINES` deleted: a product line is what registers a supplier, so it put 16 banks and 24 institutions into the enterprise-software market — shares summing to 646%. **GUARD's share-sum invariant, written three commits earlier for exactly this, went from 24 violations to zero.**
     - **What the verification found that was NOT mine:** bank headcount collapses 88k → the one-employee floor by week 3, identical in an A/B against the pre-change tree. **It gates the VALUE of IND-R1, not its correctness** — the banks pay their staff for two weeks and then have none.
109. **EMP — the labour collapse, traced end to end.** The labor market sheds when EBITDA falls below the cost-of-capital charge. **The seed solves that in AGGREGATE**, so an aggregate placed exactly on the threshold leaves roughly half the distribution below it: **92 of 629 USA firms trip in week 1, carrying 1.52M of 6.01M jobs.**
     - **And the rule is ONE-SIDED.** A firm below the line sheds; a firm above it does not hire in compensation. **The seed's own comment states the symmetry it assumes and only the first half exists in code.**
     - Two bank-specific causes fixed, both rule 3: loan losses were `random() × 0.05 × totalAssets` on a denominator including sovereign bonds; and a bank's seed revenue was a Pareto draw from the small-firm curve (1.68B against 7.47B NIM-implied) that the model spent years climbing toward, which every consumer read as output growth.
     - **Neither moved the non-bank trip count.** The row this replaces said three primitives disagree; that was true and insufficient.
110. **EMP second pass — two one-sided rules made symmetric: necessary, not sufficient.**
     - The affordability rule now hires as well as sheds. **USA unemployment falls in week 1 for the first time in the model's life (10.6% → 9.7%).**
     - **THE SAME DEFECT, IN THE WAGE RULE.** `unfilledShare` runs [0,1]: it can say a firm found hiring hard, never that it found it easy. Measured at 33.6% unemployment with tightness 0.000, the average offer was RISING while the going rate had fallen 1.9% in twenty weeks — all of it composition. **LAB made the wage a price on the way UP and left it administered on the way DOWN, hiding in a `Math.max(0, …)`.** The mirror of "could not fill" is "could fill at will", and the stage already measures it: tightness.
     - **And it is not enough — 33.4% by week 20 against 33.6%.** Said plainly so nobody re-runs this: **price adjusts on an annual timescale and quantity on a weekly one.** That asymmetry is real; no defensible wage speed outruns a world that opens with half its firms below the line.
111. **EMP third pass — the labour collapse is a PRODUCTION-STRUCTURE defect, and neither candidate fix was aimed at it.** Option (b) was approved, investigated, and disproved. That is the result.
     - The aggregate solve is a mean applied to a skewed distribution: the index is 1.280 but the employment-weighted median firm breaks even at 1.22, and **89% of employment sits at firms below the aggregate index.**
     - **THE ROOT: revenue per worker is 1.13x value added per worker.** For Consumer (3.86M jobs) it is 0.92x and Industrials 0.93x — **gross output BELOW value added, which is impossible by definition.** Payroll is **61% of revenue** against a real ~30%.
     - **And the model is INTERNALLY CONSISTENT at that level, which is the finding.** Its own recipes carry a mean intensity of 0.138, implying a multiplier of 1.16x — the 1.13x measured. **The only thing claiming 2.5x was a comment.**
     - **So the defect is that production has no DEPTH.** A real intermediate share is ~50–60%; this one's is 14%. Owner: CHAIN.
     - Explicitly not done: rescaling the multiples would move the seed off the one thing it agrees with, and scaling demand does nothing because headcount is derived from revenue so the ratio is invariant.
112. **IND5 — electricity, and the one non-storable good.** The one input every industry buys, missing entirely. **Its physics do the work, not a table:** `IN_PLACE` means it carries no freight and cannot cross a border — which is what a grid is — and storability reads exactly that mode, so it is the model's one genuinely non-storable good without a line saying so. Mean recipe intensity 0.138 → 0.164.
113. **IND8 and IND9 — every firm of a size was the same firm, and one row was already closed.**
     - **IND9 was done and nobody had checked:** measured 2.7x EBITDA against the ~17.8x the row was opened for. **Re-measuring before working saved the work entirely.**
     - **IND8's real defect was not the distribution's SHAPE, it was that there wasn't one.** `buildTemplate` is deterministic in (sector, rank), so every firm of a given sector and size opened with an identical balance sheet: 199 listed USA non-financials at 98% investment grade, **zero BBB, zero high yield** — the cohort 07b and 07d exist to price had no issuers.
     - The fix draws a takeup share of each firm's own covenant ceiling. **BBB 0% → 14%.** The ceiling is applied ONCE, not iterated: in that table a weaker credit carries a LOOSER covenant, so each downgrade would license more debt and the iteration runs away to CCC.
     - Seed high yield stays near zero and that is correct: the covenant rule is what stops a firm ISSUING its way into high yield. HY arrives by DETERIORATION.
114. **IND2 — a subscription is not a unit.** The sale buys a CONTRACT, so it keeps paying until it churns. Over a quarter a subscription seller's revenue moves **−1.2%** against a unit seller's **−6.5%**.
     - **§7.41's trap, caught by measuring instead of assuming:** the probe said **240 listed firms carried a base and 0 private ones**, because the private path rebuilds from a fixed field list. **This is the third time that fixed list has swallowed a new field; anything added to a company must be checked on BOTH paths.**
115. **IND-R6 — the private tier is a second code path, and it has been quietly eating changes.**
     - **1,712 firms employing 8.20M people, twice the listed tier, paying NO wages** — 67% of the USA's named wage bill never reaching a household, IND-R1's defect at 46x the size of the bank version that got fixed. Plus 2.91B/wk of cash moving outside the settlement layer.
     - **THE LESSON: a forked path does not just duplicate code, it lets the SEMANTICS drift.** The public margin is GROSS (payroll charged on top); the private one is NET. Same name, opposite meaning. Copying the public treatment across therefore double-counts — attempted the same day, it took unemployment to 42% by week 10 and the harness 8 → 196. **Reverted and recorded, because the trap is invisible from the code.**
116. **The work order reconciled against what the week established.**
     - **A foundation item's root cause was sitting in the depth tier.** The table's rule is "never start an item whose prereqs aren't done", and it was silently violated for the two highest-priority rows because the prerequisite was only DISCOVERED by diagnosing them. **The tier a project belongs to is not knowable until its cause is.**
     - **Two §6.1 rows had been fixed without being closed** — and the same measurement that closed one found the SAME defect one branch down at 46x the size. **Close a row precisely rather than loosely:** "banks pay no wages" was true, and fixing it fixed 6% of a wage-bill gap whose other 67% was never in the row at all.
117. **CHAIN-D — the recipes were shallow because of their GRANULARITY, and deepening them proved §7.111 had the causality backwards.**
     - **A bill of materials is a property of a PRODUCT and it was stated per INDUSTRY.** At industry granularity a real BOM is unwriteable — the only honest statement about extraction, refining and power at once is what they have in COMMON — so all sixteen recipes had collapsed to the same overhead line, **identical in 13 of 16**. Refining bought no crude, a fab no process chemicals, retail none of the goods it sells. Now per product: **mean intensity 0.164 → 0.412 with dispersion for the first time.**
     - Two load-time assertions: a recipe may not name its own product (**unavoidable at industry granularity**, since refining consumes crude and both are Energy — a second reason the recipes had to stay shallow), nor an input that does not exist.
     - **AND THE RATIO §7.111 OWNS DID NOT MOVE: 0.878 → 0.879.** A 2.5x deepening changed it by one part in a thousand. **That is not a small effect, it is NO effect, and it falsifies the attribution rather than the fix.**
     - **THE REAL ROOT is in the demand seed.** `C + I + G` is a FINAL-demand identity, so corporate demand is INVESTMENT ONLY and **there is no intermediate demand in the seed at all** — gross output is pinned to final demand and the ratio is ~1 BY CONSTRUCTION. §7.111's consistency was real and its causality inverted. **The number that moves when you fix a thing is the test of whether you found the thing.**
     - One defect found on the way, owner IND3: `realInputConsumptionCostUSD` is the real cost of the real lots consumed **and it reaches only the display COGS breakdown**, while an INDEX stands in for it in the P&L. **It is why deepening the recipes was safe: input cost does not reach the P&L, so nothing could collapse.**
118. **CHAIN-E — intermediate demand exists, headcount is value added over productivity.**
     - Demand is final PLUS the intermediate half, solved from the registry's own BOM as `X = F + AX`, with convergence ASSERTED. Applied in BOTH places that build the identity — two copies of an identity is how it drifts.
     - Headcount: dividing value added per worker into GROSS output needs the ratio between them, which is exactly `1/(1−a)`. That derives seven stated multiples **whose own comment said they "follow the recipes" while nothing derived them.**
     - **Harness 18 → 2; every unemployment violation gone.** Seed unemployment 10.5/25.7/17.9/23.5% → **7.5/6.5/3.8/7.8%**. Consumer 0.92x → 1.42x — the ratios that were below one and therefore impossible.
     - **Why the fix was not tautological:** productivity is an independent Zipf primitive, so three unrelated derivations land in the same place.
     - **AND EMP DOES NOT CLOSE** — over 60 weeks unemployment still escapes; the A/B shows it PRE-EXISTING. Do not read the ten-week figure as EMP closing.
     - **Consistency between numbers you chose is not a measurement.** What broke the tie was deriving one from something none of the three could see.
119. **One headcount rule for all three tiers — and the firm universe's value added is 53% of GDP.**
     - **The rule was stated in FOUR places and they disagreed.** The private generator treated revenue AS value added — the exact defect §7.111 named, still live because **there are two firm generators and the fix landed in one of them.**
     - The private tier's overstatement: payroll **61.3% of revenue against the public tier's 35.5%** on the same stated margin, leaving 1.5% before other opex. **That, not a double-count, is why §7.115's attempt to charge it real wages tipped 1,712 firms below cost of capital.**
     - **The thing underneath, quantified:** USA total output 567.4B, intermediate 40.0%, firm value added **340.5B against GDP 639.2B — 53%**. Firm employment can only be 5.87M against **11.55M** seeded. **The firm universe cannot employ the seeded labour force at the seeded productivity, and never could** — each tier's overstatement covered part of the gap, which is why removing them one at a time walked the harness 2 → 33 → 42.
     - **Three tiers "agreeing" meant nothing, because each was stated separately and each was wrong in the direction that hid the same gap.**
120. **The seed-scale slice — the identity lived in THREE places and the one that wins had no solve.**
     - Three copies of `C + I + G`, and CHAIN-E's intermediate solve was added to two of them, **missing the only one that survives**. The placeholder seed produced **1,481B** of USA output and the authoritative one replaced it with **567B**, sizing every firm against a market 2.6x larger than the one it sold into.
     - **The tiers each took a share; nothing made them add up:** named firms 93% of output and the pools another 36% — **129% between them.**
     - Firm value added against GDP **0.533 → 0.888**; implied firm employment 5.87M → 9.78M against 11.55M, the remainder being government and financials. **Harness 42 → 30, seed unemployment 36% → 20.3%.**
     - **The same identity written three times will diverge, and the copy you did not know about is the one that decides.**
121. **IND3, CAP0 and IND-R6 — the margin became an outcome, the clamp went, and the second code path is deleted.** One commit because it is one change: you cannot delete the fork while the two sides disagree about what a margin means, nor make a margin an outcome while a clamp holds it in a band.
     - EBITDA is revenue less what the firm actually spent — real lots at prices paid, the real wage bill, and an other-opex rate derived from the firm's own opening books, so week 0 is unchanged and every later move is a real cost moving.
     - **The `[2%, 65%]` clamp is gone** — rule 2's oldest open violation and the reason no firm could report a loss at the EBITDA line. Nothing replaced it: a margin that is the residual of real costs does not need a band.
     - **The listing branch is DELETED, 107 lines.** Not patched: an earlier attempt to give the private path equivalent-but-parallel economics was the same mistake in a new form.
     - **Harness 30 → 20, and EVERY UNEMPLOYMENT VIOLATION IS GONE**, in all four regions in every week, for the first time in this sequence.
122. **What it takes to bring financial firms into the same build, and where the funds actually sit.**
     - **The dispatch is right; the CONTRACT is what still lets financials out.** `ProfilePnl` returned a margin, so **a profile is permitted to state one** while the operating path builds EBITDA up from real costs. **Invert it:** a profile returns its revenue mechanism and its own extra COST LINES, and shared code computes EBITDA — one change, and IND-R4's two stated ratios die with it rather than one at a time.
     - **Step 4 is a blocker CHAIN-D created.** A recipe is a property of a PRODUCT, and IND-R2 correctly gave financials no product line — but those are the same field, **so a firm that sells nothing now BUYS nothing**: a bank purchases none of the professional services, facilities or software it obviously does.
     - **Where the ETF and the MMF sit: their own balance sheets**, not wrappers on a sponsor's book. **And the asymmetry, which is a defect:** the ETF's shares are held BY NAME while the MMF's liability is one scalar with nobody named on the other side — rule 13's residual with no holder, and rule 14's one-legged flow.
123. **CORRECTION to §7.122's step 6 — a fund is not a firm, and "one build" needs TWO shapes.** Written and corrected the same day, which is why it is recorded rather than quietly edited.
     - Step 6 read §6.1's "the institutional Company and the InstitutionalEntity are two firms" as an argument for one entity type. **That row is NARROWER** — an insurer existed as both, the same real thing represented twice. **Generalising it to funds turns a duplication defect into a category error.**
     - **The axis is FIRM vs FUND.** A firm has staff, produces or intermediates, earns revenue and pays wages. **A fund has no staff and no production:** a pool of assets whose liability is units, run by a firm for a fee.
     - **Five different ways of saying who owns a pool, across seven types**, of which the ETF's is the only complete one. **HEDGE_FUND and PENSION_FUND are a manager and a vehicle in one entity.**
     - **The lesson: "one representation" is a rule about not modelling ONE thing twice, never about modelling two different things the same way.** §7.122 reached for the first and landed on the second — in a document whose recent record is all about forks that drift, which is exactly when the pull to unify everything is strongest.
124. **The sovereign float counted paper nobody was selling — the debt §7.120 owed, paid.**
     - OWN7's rule had two carve-outs and needed three: it did not subtract **the share no real book holds at all** — ~20% sitting with households, foreign official and retail. So the bidders bought paper from nobody and the total held climbed past what exists: **80% at seed → 101% by week 3.**
     - **One trap worth the line:** an institution holds this book's paper under the BUCKET id and a corporate treasury under a TRANCHE id — two id spaces for one instrument. Reading the wrong one collapsed the float and forced every real holder out into the dealer (institutions 201B → 0).
125. **IND finishes at firms — the profile contract is inverted, financials buy what they consume, and the harness is GREEN.**
     - **A profile may no longer state a margin.** Three of four did — bank 0.40, manager 0.35, insurer 0.15 — while the operating path built EBITDA from real costs. **What a margin MEANT depended on which arm of the dispatch a firm went down.** EBITDA is computed in exactly one place now.
     - **A firm that sells no product still BUYS.** One accessor serves stage 05's bidding, stage 08's cost and the supply graph, **so a firm cannot be charged for an input it never bid for.**
     - `INSURER_EXPENSE_RATIO` deleted: a flat share of premiums, so no insurer could be run better than another — and double-counting besides.
     - **Measured: HARNESS PASSED, 0 violations — the first green run in this sequence, from 18 → 15 → 2 → 33 → 42 → 30 → 20 → 0. Every number in that walk was a real defect surfacing as the thing above it was fixed.**
126. **The money fund's ledger — two missing legs, and a row I logged without measuring.**
     - A fund issued new shares to no holder, so its liability rose weekly while every holder's asset stood still. Its own note said it closed an assets-versus-shares divergence; **it closed it on the fund's side and opened the same hole on the holders'.**
     - **§7.41's trap for the THIRD time:** `evolution.ts` rebuilds `householdState` from a fixed field list and `mmfSharesUSD` was not in it, so the household's claim was destroyed and recreated from that week's diversion alone. **A rebuild that enumerates its fields will keep doing this — three for three.**
127. **G1b diagnosed: it is not a deflation, it is a SUPPLY FAMINE in the intermediate goods CHAIN-D created demand for.**
     - Fixed: the seed priced total output against a FINAL-buyer volume, so every dollar of intermediate demand became PRICE instead of quantity.
     - **The real one: an 8x shortage printing a FALLING price.** USA week 12, `upstream_extraction` supply **2,458 units against demand 20,954**, inventory 0, fulfilment 0.00 — **and its price down 92%.** This is not excess supply and never was; **reading the falling price as deflation is what made it look like one for the model's whole life.**
     - The chain: deep recipes tripled intermediate demand, the SUPPLY of those goods was never scaled to match, so the input market drains, firms cannot make what they sold, revenue falls and the price follows. **Unemployment tracks it because a firm that cannot produce cannot pay staff** — which is why no coefficient in the labour market or the price index could have fixed it.
128. **The commodity market had two different bases for its two sides.** Demand was a share of the whole category's output; supply was the entire revenue of the two firms carrying the tag. **Invisible while recipes were shallow, structural once demand tripled.** Both sides are now that share of the same sub-unit. Supply 2,458 → 9,853 units.
     - **Not closed:** the input market still drains, because physical capacity does not grow toward a market that is permanently short.
129. **CAP — investment responds to a measured shortfall, and it costs something.**
     - **The capex decision had no term for "I cannot fill my orders."** Every input was FINANCIAL, so a firm that stocked out every week invested exactly like one sitting on a full warehouse. That is why the famine survived both other fixes.
     - **Deflation gets WORSE — −11.9% → −16.3%.** Recorded rather than reverted: **an investment response without a production-stopping rule is half a control loop.**
130. **RULE 15, FOURTH TIME: a seller's reservation price was a fraction of the market price.** So when the price fell every seller's floor fell with it — **a downward ratchet with nothing real underneath it, and the reason a market with 8x excess demand could still print a falling price. No shortage can stop a fall when no seller is ever unwilling.**
     - A cost is a dollar figure. Relative-price dispersion collapses from **0.01x–14x to 0.13x–2.78x**.
     - **AND THE HEADLINE GOT WORSE: −16.3% → −18.8%.** Two correct mechanisms, one metric moving the wrong way, recorded rather than tuned away.
     - **Capacity is inversely proportional to a seed price, so any change to that price silently rescales the physical economy.**
131. **IND-R3 — every good has its own consumption intensity — and the five-fix pattern.** One intensity for all 37 goods meant a household consumed as many units of aerospace as of food. What is stated is RELATIVE frequency.
     - **Five changes into the price chain, every one principled and harness-green, the measured deflation has gone −12% → −25%.** Dispersion improved enormously; the LEVEL got steadily worse. **A metric that moves the wrong way under five independent correct fixes is not being caused by any of them.**
132. **MAC(a) diagnosed to one line — and §7.131's "no anchor" conclusion is WRONG.** Measured over twenty weeks: nominal wages −4.2% (sticky), deposits +1.3%, nominal demand +17%, income flat, capacity −5% — **and prices fall 30%.** The level is not drifting for want of an anchor, and §7.131 was written from four data points without measuring wages or money.
     - **Prices falling into FLAT NOMINAL DEMAND and a SHORTAGE is backwards.** It is price FORMATION.
     - **THE LINE.** §7.130 anchored the floor to cost in dollars, but that cost is still mostly PROPORTIONAL TO REVENUE — inputs are `intensity × revenue` and opex is `rate × revenue` by construction. **The ratchet survived the fix because the cost it was anchored to still chases the price.** Rule 15 in its subtlest form: the bound LOOKS like dollars and is a percentage wearing dollars' clothes.
133. **A negative result, recorded because it was my own best hypothesis and it was wrong.** Overhead as a per-head dollar cost was built and measured: **deflation −18.8% → −28.2% and the harness went RED.**
     - **Tying a cost to a falling quantity is no better than tying it to a falling price** — in exactly the runs where the ratchet bites, headcount is itself collapsing, and employment falls faster than revenue. **A "sticky" cost has to be anchored to something genuinely sticky, and here that is the WAGE, not the wage BILL.**
     - Reverted, with the reasoning left at the site. **Declining to ship a change that fails its own test is not clamping a symptom** — unlike §7.119's revert, which hid a number.
134. **IDX — an index is a statistic, a beta is a measurement, no published name is a real brand.**
     - The ±15%/week index clamp is gone; its only effect was to hide the equity runaway inside the published number while the constituents ran — **the one thing a published index must never do.** The $0.10 stock-price floor is gone too.
     - **Beta is measured.** It was stated per sector and then used to discount the very stock that should produce it, so a name's risk premium was a property of its sector LABEL. **This model published both series every week and never computed it.**
     - Rule 4: nine real brands deleted, **and the TYPE carried them too**. Currency codes stay — a unit of account is not an imported equilibrium.
135. **DEM first half — regions differ in KIND, and the difference is generated, not imported.**
     - Both clamps deleted: population growth held inside [−3%, +4%] and migration inside ±1%, so a region could neither shrink nor boom — the entire quantity the project exists to make vary.
     - **The rule-4 trap in DEM's own brief:** "Japan shrinks and ages, the USA grows by migration" is a real-world OUTCOME. What IS legitimate is the mechanism behind it — **the demographic transition**, fertility falling as income per head rises. **Which region ends up shrinking is an outcome of that draw.** Birth rates 1.156% (USA, highest productivity, lowest fertility) to 1.322% (EUR).
136. **IND4 — how an industry funds itself and what it pays out.** Payout was `0.6` for everyone; funding mix was rating-only, when what the money BUYS decides the term.
     - **`cyclicalityBeta` deliberately NOT added**, though the brief listed it: beta is a MEASUREMENT since §7.134, and stating one per industry would restore what IDX just deleted. **A work item's own brief can be stale; the rules are not.**
137. **IND6 — share versus margin, expressed only through the real offer price.** The posture is the firm's OWN inventory position, which stage 05 already computes for the production throttle: a warehouse filling up gives up margin to move stock. **The same signal already governs QUANTITY; IND6 is that it should govern PRICE too — which is what a real seller does first.** The contribution-margin floor is beneath it: a firm gives up profit to win share, not money.
138. **IND7 first half — the antitrust hold is measured; the divestiture is not built.** A competition authority acts on a share held for a sustained period: one quarter at 45% is a good quarter, a year at 45% is a position.
     - **What is NOT built, and why it is recorded rather than half-done:** a spin-off must MINT a new issuer's holder register, and `settleCorporateActionOnHolders` only SCALES an existing float. **Building that carelessly would undo OWN7.** The honest order is to extend the ownership machinery first.
139. **CAP — a firm that cannot cover unit cost STOPS producing. The control loop closes.** The throttle answered "is my warehouse full" (floored at 0.3, so a plant with nowhere to sell still ran at three tenths forever); nothing answered **"does making one more unit lose money"**.
     - **That is what makes a downturn end:** supply leaves until the price recovers. And it is why CAP0 had to go first — while EBITDA could not be negative, this could never fire.
     - **Deflation −25.5% → −21.9% — the first improvement in this whole chain**, after four fixes that each made it worse or left it flat.
     - **A half-loop recorded as a half-loop is recoverable; a half-loop shipped as a fix is not.**
140. **DIST first slice — the SME pool carries a cross-section, and a credit-cycle decision becomes an integral instead of a function of the mean.**
     - **The measurement first.** Named tier at seed: leverage p10 1.50 / p50 3.12 / p90 5.92, **11.2% of firms within 10% of the covenant threshold**, while the affordability line EMP sheds against has 1 firm of 591 near it. **DIST's value is on the CREDIT side, not the labour side.**
     - **The defect.** A pool's default rate read `max(0, 1 − coverage)` at the pool MEAN, so a pool averaging coverage 1.2 had exactly ZERO coverage-driven defaults however many firms sat below 1 — **a mean-preserving spread could not cause a single default**, which is the mechanism of a credit cycle. Plus a `[0.002, 0.25]` band that existed to bound a formula read at a point.
     - The strata are K quantiles of the SAME leverage draw the named tier uses — no second distribution, no imported dispersion — re-centred on the pool's own book weekly, so this **adds a cross-section and restates no debt**. Aggregation exactness holds at K = 1, 5, 9, 20, 50.
141. **DIST — the cash term, which is the half that is live.** It read the pool's MEAN cash cover, so a pool holding six weeks of wages on average showed no distress even when a third of its firms held two. **Cash is not spread evenly across a pool:** what a firm has left is what its earnings leave after ITS OWN debt service, so the strata paying the most interest hold the least — which is exactly why they fail.
     - At exactly the target six weeks of cover the scalar reports **0.0000** stress while the cross-section reports **0.0357**. **A scalar is blind precisely in the approach to a threshold, which is where a credit cycle is decided.**
142. **DIST/COH — the wealth MPC is derived from each tier's own balance sheet, and reproduces a pattern the stated table assumed away.** Four stated numbers whose own comment admitted the source ("stated from the empirical literature").
     - **AND THE RESULT IS NOT MONOTONE, which is the finding.** BOTTOM_50 0.0557, TOP_9 0.0189, TOP_1 0.0142, and **NEXT_40 the LOWEST at 0.0126** — because its wealth is 89% home equity. That is the **wealthy-hand-to-mouth** household, and **the stated table could not express it at all**: it was monotone by construction.
     - **A mechanism that reproduces a known real-world pattern WITHOUT BEING TOLD IT is the whole point of rule 4.**
143. **DIST — the absorbing barrier and its reinjection.** A pool default wrote the bank's loan down but left the FIRM in the pool: it could default 5% a year forever and its cross-section never changed — **the lender lost the money and nobody stopped existing.**
     - Exiting weight is drawn from the strata in proportion to their OWN distress, so survivors are less levered — **which is what a credit cycle's cleansing phase IS, and a scalar pool could not represent it at all.** Reinjection at the unlevered end is what makes it a BARRIER rather than a rescale: new firms form without a balance sheet.
     - Twenty weeks: weight sum 1.000000 → 0.999999, **mean leverage 2.700 → 2.334 while p90 moves only 4.197 → 4.122.**
144. **DIST/COH — the deposit split is an outcome of who saved.** `TIER_BALANCE_SHEET_WEIGHTS.deposits` applied a fixed share of the aggregate **every week**, so a tier that saved more never got richer — and the table is documented "US SCF-shaped", an observed equilibrium.
     - **Seed every tier flat and the skew must be produced:** 25/25/25/25% → 6.4/29.1/32.1/32.4% at w52 → 2.3/16.2/38.0/43.5% at w104, top-to-bottom **1.00x → 19.32x. A distribution that emerges from a flat start is derived; one read from a table is assumed.**
     - Honestly noted: it concentrates FAST, which is an outcome of the savings-rate spread the cohort budgets produce. **Before this, the question could not even be posed.**
145. **DIST — ALL NINE of §6.3-A's stated cross-section tables are now measurements**, and each turned out to have a DIFFERENT cause, which is why nobody had derived them.
     - Deposits: the stock a tier's saving built. Wealth MPC: savings rate × liquidity. Equity-like and private business: one measured appetite, so two tables with one cause is one derivation. Institutional claims: the long half of the same saving. Unmodeled: **a stated split of an unknown is the worst of both.**
     - **Housing and mortgage are BORROWING CAPACITY, not wealth.** A lender advances a multiple of INCOME, so housing concentrates where income is — **that is the cause of the wealthy-hand-to-mouth middle**, produced rather than assumed.
     - Consumer debt: `(1 − savings rate) × income` — the propensity to borrow times the base, both measured.
     - **§5-COH should be re-read before it is started; most of what it describes has happened**, by a different route than it planned.
146. **IND15 — labour constrains output.** The production plan was the plant alone, so a firm that could not hire produced as much as one fully staffed and an unfilled vacancy reached nothing. Deflation **−24.76% → −19.82%**.
     - **A mechanism that binds on nothing is a mechanism that is not there.** The labour market cleared, wages moved, hiring succeeded and failed, and none of it reached a price until output could feel it.
147. **IND10 — production takes time; WIP is a real stock.** `productionLeadWeeks` existed on all 37 goods, was 0 in every one, and was read nowhere. A firm offers what it holds plus what its plant FINISHED, not what it started. **$69.5B of work in progress that did not exist before**; no behavioural change at rest, which is the correct result — the lead binds when something moves.
148. **IND11 — the backlog is a stock, and it exposed an ordering defect older than itself.** Both damages legs are the cover measure, so neither has a free coefficient and a breach costs nothing when the market moved the wronged party's way.
     - **THE DEFECT.** Contracts settled against LAST week's closing stock while production reached the warehouse after the auction, so **a firm's own output was never available to its own committed orders** — and since the offer already reserved the contract volume, what it left was exactly the shortfall. **Every contract in the economy under-delivered, permanently, and nobody noticed because an unfilled order evaporated.** Order is now PRODUCE → DELIVER COMMITMENTS → AUCTION THE REST: **69% of the book short → 15.6%**, deflation −19.85% → −12.90%.
     - The probe went red on one band and was A/B'd to the cause: **a buyer that received nothing on contract held no lots, consumed nothing, and WAS NOT CHARGED for 60% of its inputs.** Making the deliveries real made the costs real.
149. **LAB — THE HIRING BRANCH HAD NEVER FIRED.** One half of the employment decision was nominal and the other real. The level path computed **this week's dollars over the seed's dollars, with no deflator**, so in a deflation every firm read as overstaffed, `understaffedHeads` was zero for everybody, and hiring is gated on exactly that — while shedding read REAL earnings against a REAL capital charge.
     - **Unemployment falls for the first five weeks for the first time** (20.3% → 18.0%); week 10 28.8% red → **25.7% green**.
     - **§7.146's lesson in the one costume no code reading finds: the logic was right and the UNITS were wrong. Rule 9 is about periodicity; a price level is part of the number too.**
150. **IND12 — domestic trade credit was gated to cross-border by ONE LINE.** Everything XB3a-5 built applied only to sales crossing a border, which is the minority of trade. **The one real difference is the invoice currency, and for a domestic pair there is no choice to make.**
     - 217,030 invoices, $15.3B, **65% domestic**; **receivables = payables exactly.**
     - **The third check EMERGED rather than being built:** receivables per week of sales rise monotonically with production lead (0.60 → 0.83 → 0.96), although the leads were set for IND10 with no thought to working capital and the terms come from credit quality.
151. **IND13 — assets under construction: a machine on the loading dock is not plant.** Gross PP&E moves when the asset ENTERS SERVICE, from the good's own commissioning lead. Both arrival paths feed it — **an ocean crossing was the other half of the wait, not a substitute for commissioning.**
     - 2,314 firms carrying construction, **p50 9 weeks still to wait** — the queue binds rather than emptying instantly.
     - **The measurement found something bigger than the slice:** capex is not covering depreciation by an order of magnitude, and there is a ±2%/week clamp on capacity growth next to it. **Both were invisible until the stock existed to look at.**
152. **IND14 — reliability is a supplier attribute, and IND11 is what made it measurable.** Who a buyer contracted with was a uniform draw over everyone in the money: a supplier that had failed for a year was exactly as likely to win the next contract as one that had never missed.
     - **There was nothing to measure before** — an undelivered order evaporated, so a chronic under-deliverer was indistinguishable from a punctual one the following Monday.
     - Smoothed at 0.9 **deliberately, because reliability that one good week repairs is not reliability.** The one floor bounds the WEIGHT, never the record: a buyer who has never dealt with a firm cannot know it is unreliable, so somebody tries it.
153. **IND19 — corporates already buy insurance; the row was hiding a DOUBLE CHARGE.** §7.125 deleted the expense-ratio charge and **left the cash leg that balanced it**, so the same expense was taken twice. **A cleanup that removes a charge must chase every cash leg balancing it, and the comment explaining the dependency is where to look.**
154. **IND17 — prepayments: negative working capital, and IND10 decides who gets it.** Each week's delivery settles against the deposit FIRST; the full price again would collect for the same goods twice. **There is no category list anywhere** — a good made on demand has no work in progress to fund, so the lead does the filtering and the zero falls out.
     - $4.4B across 1,637 suppliers: **0.00 weeks of sales at lead 0, 0.11 at 1–5, 1.06 at 6+.**
155. **IND18 — the model has a calendar, and the probe's headline is a SEASONAL print.** Two numbers, not a table: one cosine per side. **It averages to exactly 1.000 over a year on both sides of all eleven goods**, so seasonality redistributes and never creates.
     - The agriculture amplitude was corrected on reasoning about what the sub-unit IS (a basket of staggered plantings, not one crop), **not on where the print landed.**
     - **WHAT THIS DOES TO THE PROBE must not be missed:** a 10-week run now samples ONE SEASON, and the week-10 headline moved −16.79% → +4.33% across this slice alone. **The number is not a steady state any more and never was one; it is now visibly not one.**
156. **IND CLOSES except the one slice that is a refactor.** What the row was worth was not the slices but three defects that came out of building them, each invisible until a mechanism existed to expose it: contracts settling against last week's stock (§7.148), the hiring branch that had never fired (§7.149), and the insurer's double-charged expenses (§7.153).
     - **The pattern across all three:** a mechanism that binds on nothing is a mechanism that is not there — and the three ways it happens are that the thing it would bind on does not exist yet, the units are wrong so the condition never trips, or a cleanup removes one side of a pair. **None is findable by reading the logic**, because in all three the logic is correct.
     - **Three verifies EMERGED rather than being built**, which is the sign the mechanisms are real and not fitted.
157. **Where else the DIST treatment pays — the sweep.** The test is: carry the distribution only where a decision is NONLINEAR, because `E[f(x)] = f(E[x])` holds only for affine `f`. So the question is not "what is a scalar" but **"what scalar feeds a threshold, a min/max, a default, or an absorbing state".**
     - Four found: the mortgage book's LTV (measured **0.340 against a kink at 0.75** — the mechanism is inert and a constant is doing all of it); SME pool cash; the household credit tiers (**a distribution that cannot move** — the state is the moments AND their motion, the Kolmogorov-forward half that is easy to leave out); and cohort consumption at the borrowing constraint (**the distribution is built and then collapsed one step too early**).
     - **The general rule, cheap to apply:** find every `< 0`, `Math.max`, `Math.min` and rating cut whose argument is an AGGREGATE, and ask what fraction of the population is on the other side of it. **Where the aggregate sits far from the kink the mechanism is not merely inaccurate, it is switched off, and a floor constant is quietly standing in for it.**
158. **TRIED AND REVERTED — saving as a per-tier buffer decision.** The diagnosis stands: `aggregateSavingsRate` is an INPUT of four coefficients, and the tier rates are scaled to hit it, so **the cross-section cannot disagree with the aggregate** — top-down, and the opposite of what a distribution is for.
     - What I built: a buffer-stock rule against 12 weeks of income. **Measured: GDP 0.78T → 2.1 BILLION trillion.**
     - **The failure is a units-of-meaning error, not an arithmetic one.** `deposits + mmfShares` is not a transaction buffer — it is the household sector's ENTIRE liquid wealth, so every tier read as hugely above target and dissaved. **A buffer rule needs the buffer and the long-horizon savings stock to be DIFFERENT stocks**, and this model has one liquid pool.
     - **A stated shape parameter STANDS IN FOR a missing mechanism. Deleting it before the mechanism exists does not make the model more bottom-up — it makes it wrong, immediately and violently.**
159. **DIST/HSG — the mortgage book is a cross-section, and the model can now have a mortgage credit event. It structurally could not before.**
     - One `avgLtv` per region fed a severity curve flat below 0.75, so the 0.05 floor was 100% of severity everywhere every week. **A second error hid inside the first:** the ratio was debt over the WHOLE housing stock, counting outright-owned homes as collateral. It read 0.340; against the collateral each loan was actually written on, the mean is **0.592**.
     - LTV p10 0.16 / p50 0.63 / p90 0.79, **16.9% above the kink. A −20% price move takes severity to 2.1x and −35% to 4.2x — where the one-average book says its floor at both**, no credit event possible short of a ~55% crash.
     - **A bug worth keeping:** the first seed scaled collateral by REMAINING principal, pinning every cohort at its origination LTV forever — a cross-section with no cross-section in it. **Collateral does not amortise.**
160. **HSG — the rate reaches a household now, by both routes.**
     - **THE RESET was completely missing.** A mortgage never matured and never repriced, so **no existing borrower was ever reached by a rate rise** — only new ones. A 30-year loan on a 5-year fix, with the seed staggering the clock so resets arrive continuously: **17.52% of the book reprices within a year.**
     - **A reset changes who defaults**, not just cash flow: default frequency is per vintage, scaled by that cohort's own coupon against the market — a household paying 7% on a loan taken at 3% is under more strain than its neighbour.
     - **Borrowing capacity sees the rate.** The same volume of houses changed hands at 3% and at 12%, and the only thing that could decline a household was the BANK's capital. What is constrained in reality is the PAYMENT.
     - **HONESTLY: the affordability limit has SLACK today and that is correct, not inert.** Prices are 3.1x income and the DSTI limit binds above 6.9x. **This is the opposite of §7.159's floor**, which could not bind short of a 55% crash; this one binds the moment prices rise.
161. **DIST — pool distress layoffs integrate over the strata.** `cash < 0 → shed staff` applied to a POOL'S TOTAL says either every firm in a pool sheds or none does — the same code at two resolutions with only one of them right.
     - **Bounded at 1 because it is a SHARE OF FIRMS** — definitional, not behavioural.
     - **The Jensen gap in one line: 19 of 64 pools are SOLVENT IN AGGREGATE but have distressed strata**; only **2** have negative aggregate cash, which is all the old rule could ever see. Distressed share p50 0.00 but p90 0.58–0.76.
162. **DIST/CRD — three one-way ratchets in the credit tiers, and my own diagnosis was wrong first.**
     - **THE CORRECTION FIRST, because it is the lesson.** §7.157 logged this as "the distribution cannot move". That is false — the shares migrate every week. I read four seed values, saw stated numbers, and concluded frozen **without reading the evolution path forty lines below.** **A seed value is not evidence about a mechanism.**
     - What was actually wrong is worse: migration only ever went DOWN (**nobody ever recovered a tier**, so any long run ends with everyone in SUBPRIME); delinquency only ever ACCUMULATED, unbounded; and the tier rate only ever ACCUMULATED, with no anchor and as a second representation of a price `quoteHouseholdMarginBps` already sets.
     - Two-sided now: **shares sum to exactly 100.00% in all four regions**, delinquency is a real bounded ladder (0.82% → 13.89%), rates quoted off measured losses.
163. **MEASURED: household liquidity is 23.7 weeks of committed outflow — which CONTRADICTS the cause §7.158 recorded for its own failure.**
     - Against a 12-week target over 8 years the implied dissaving is 3–4% of income, nowhere near enough to take GDP to 2.1 billion trillion. **That figure is an overflow signature, not a savings rate.**
     - **TWICE IN ONE SESSION.** §7.162 logged a defect from the SHAPE of the code without reading the evolution path; this is the same error in a different costume — explaining a failure from a plausible story without checking whether the numbers could produce it. **A cause is not established until it is measured, and a confident write-up makes a wrong cause harder to dislodge than no write-up at all.**
     - What it unblocks: 23.7 weeks is a SANE buffer, so a threshold CAN be crossed. Forced selling is blocked not on a liquid/illiquid split but on **dissaving being possible at all** — a FOURTH one-way ratchet.
164. **The 2026-08-30 rescope — the work order was ordered around two NUMBERS, and rule 18 now forbids that.** Across §7.146-163 the week-10 price print moved **−25.5% → +4.3%** and **not one of those changes targeted either number**; the largest single move came from a UNIT ERROR in the labour stage.
     - **MAC's evidence is void: it was measured before ten IND slices, three root-cause fixes and a calendar, and may not be inherited.**
     - Rule 10: do not chase a MOVED number. Rule 12: do not MEASURE mid-project. Rule 18: do not SCHEDULE around a number at all. The first two govern behaviour inside a project; the third governs what a project IS.
165. **DIST 1(a) — the savings rate is an outcome, and the cause of the earlier failure was a UNITS error. Neither story I told about it was right.**
     - Re-running the stash under measurement, the rate printed **−4,251,491,541,453%** and GDP was broken **at week 1**, so it was never a feedback loop either. **The cause is one line:** `tierLiquidShare` fell back to `shareOfIncomeUSD`, **which is a DOLLAR AMOUNT used as a fraction.** Normalised, the rate lands at −2.67% — exactly what §7.163's arithmetic predicted.
     - **THREE STORIES BEFORE ONE MEASUREMENT.** §7.158's story survived two sessions and shaped a task list. **The units error was findable in thirty seconds by printing the number.** A name that says USD is not a share — rule 9's principle one type over.
     - Gone: the four coefficients setting `aggregateSavingsRate`, the λ scaling tier rates to hit it, the 0.9 cap, and the two-pass redistribution that existed to stop the cap breaking the identity.
     - **The policy rate moved to where it belongs** — debt service for the indebted, deposit interest for savers. A distributional transmission instead of a scalar one.
     - **A zero steady-state rate is the buffer-stock result and is only correct in a STATIONARY economy;** a positive one needs a life-cycle.
166. **DIST — households can sell. The mechanism is built, two-sided and correct; it reaches nothing, and BOTH reasons are worth more than the code.**
     - **The ordering is the mechanism, not the trigger.** A household runs its cash down first and sells only what its deposits cannot cover — the same buffer the saving decision is taken against. **That is why forced selling is rare, and why it is violent when it comes: every buffer empties at once, near the bottom.**
     - **It reaches $0.0B of $985B.** (a) Only fund shares are sellable — direct equity and private business are computed as RESIDUALS, so most of that is not a position at all. **A holding that cannot be sold is not a holding.** (b) Households hold no fund shares, because the sector sits permanently above its buffer and therefore permanently dissaves.
     - The harness prints both distances so "not firing" stays an observation about CONDITIONS.
167. **CAP — maintenance capex was derived from its own prior value, and the ±2%/week capacity clamp was covering for it.**
     - `target = revenue × (maintenanceCapex / annualRevenue)` — an EMA of itself with no anchor to what maintenance capex is FOR. **Whatever it was seeded at is what it stayed, and nothing in the loop could notice the plant wearing out.** The anchor is depreciation, because that is what maintenance capex IS.
     - **A clamp is almost always covering for a decision that is not being taken; delete the clamp only after the decision is real.**
     - **The fix exposed a bigger one:** firms bid ~163B/yr of capex globally against ~13B/yr of deliveries — **an 8% fill. The plant is not shrinking because firms will not invest; it is shrinking because nobody can make the machines.**
168. **CAP — where the capex bids die: four of five capital-goods categories are short.** heavy_equipment 0.26x supplied/demanded at +65% price; enterprise_software 0.29x at +174%. **The price mechanism is working — scarcity is rationed by price exactly as rule 1 wants. What is not working is supply.**
     - **THE RULE-3 DEFECT: investment is represented TWICE.** The capex industries were sized from the seed's solve for 54.0B/yr; firms bid 83.6B/yr off their own books — **1.55x what was built.** A sector built to supply one number and asked for another will be short from week 1 whatever its dynamics do.
     - **The second cause is NOT a defect and should not be chased:** a capital-goods maker needs capital goods to expand, so the shortage response is self-limiting and slow. **Do not read the fill rate as a broken mechanism.**
169. **DEM — the age structure is already there and nothing reads it.** Only `RETIRED.shareOfPopulation` is read anywhere, and only to set a death rate; `LifeCycleStageData.savingsRate` is read by NOTHING. **Fifth instance this session of a mechanism that exists and binds on nothing.**
     - **DO NOT JUST WIRE THE STATED RATES IN** — that would put back one level down what §7.165 removed at the aggregate.
     - **The derivation has no free parameter at all.** With `w` of adult life working and `r` retired and smooth consumption, the working-life saving rate is `r/(w+r)` — **and since `w + r = 1` across the population, it IS the retired share**, which the model already evolves from real births and deaths.
170. **RULE 19, FIRST PASS — 16 stated shape parameters retired, none replaced. Scoreboard ~90 → ~74.**
     - 8 deleted outright, **read by nothing**. **A stated number no mechanism needs is not a primitive, it is a leftover.**
     - 8 derived — and both tables **carried their own exit condition**, whose condition had been met, while the balance sheets had been computing the exact splits and throwing them away. **When a stated table has an exit condition written on it, check whether the condition has already been met.**
171. **RULE 19, SECOND PASS — `TIER_BALANCE_SHEET_WEIGHTS` deleted: 32 stated numbers for one seeded line. Scoreboard ~74 → ~42.** They survived only as the OPENING CONDITION, so the table was deleted **by seeding the mechanism instead of the answer**: `accumulatedSavingsUSD` opens proportional to the tier's own income share, so every share is measured from week 1 and no fallback is ever reached. Twelve were already unreachable and nobody had noticed.
     - **A stated table kept alive only by its own opening condition can be deleted by seeding the MECHANISM rather than the OUTCOME.**
172. **RULE 19, THIRD PASS — why the count stops falling here, measured.**
     - Deriving the two remaining big blocks needs WITHIN-OCCUPATION wage dispersion. **Measured across 2,512 employers: p99/p10 of 1.01x, against the 32.5x the stated table asserts.** Firms all pay the same, because the wage rule's firm-specific terms both mean-revert.
     - **AND THE STATED MULTIPLIER IS LOAD-BEARING:** 13.0x carries over half the top tier's income. **Deleting it before the mechanism exists would flatten the income distribution, not derive it** — rule 19's caveat, quantified.
     - The missing mechanism is RENT-SHARING, and the model has every ingredient and uses none of them.
173. **RENT-SHARING — a more productive firm pays more. Built, and the measurement redirects the scoreboard.** One new BARGAINING primitive; the pull is expressed as an annual rate so no speed constant is invented. **Dispersion 1.01x → 1.40x, equilibrium spread 1.23x.**
     - **AND THE MEASUREMENT SAYS THE OBVIOUS NEXT STEP WAS WRONG.** 1.2–1.4x is about right for a real firm wage premium — the mechanism is correctly sized, not undercooked. **The stated 32.5x conflates three things**, and the one the model lacks entirely is within-occupation SKILL dispersion.
     - **A measurement that shows a new mechanism working can also show it is the wrong mechanism for the thing you meant to retire. Build it because it is real; do not let it justify a deletion it cannot support.**
174. **DIST 1(b) — workers differ now: the experience cross-section, on DIST's own machinery.** The same weights/integral/barrier/reinjection DIST proved on SME leverage, pointed at people. `wageIndex` stays the first moment and every existing reader finds the number it wants; **this is what it is the mean OF.**
     - Experience premium p10 1.005 / p50 1.344 / p99 1.784; **within-occupation dispersion ~2.5x against 1.01x a session ago.**
     - **The derivation is now a JUDGEMENT, not a blocker.** ~2.5x derived against 32.5x stated — **but 32.5x WITHIN one occupation is not a plausible wage fact.** That number is the whole income concentration crammed into a wage multiplier, and the model already measures the part that belongs elsewhere: capital income is 37.6% of the top tier's.
175. **DIST 1(c) — cut-point invariance, with an affine control that proves the test can tell.**
     - SME leverage strata K=20→10 (nonlinear): 0.14% gap. Mortgage vintages (nonlinear): 0.05%. **Tenure strata, AFFINE — the control: 0.0000%.** `E[f(x)] = f(E[x])` exactly, **which is what makes the two above meaningful: a test that reported ~0 for everything would prove nothing.**
     - **The subtlety: "carry the distribution where the decision is nonlinear" must be read against the DECISION, not the quantity.** The tenure strata add nothing to the mean wage but are essential for the tier SPLIT, which is a quantile operation.
     - Reported, not asserted — a threshold on this gap would be a stated number doing exactly what rule 19 forbids.
176. **CAP — the clamp programme closes: five bounds deleted, one dead constant, and the carrier floor learns about capital.** Every one now had a mechanism under it: the production-response band, the input-supply 0.3 floor (production out of nothing), the pool's offer floor, the growth-capex 0.4 floor (**its own comment had already convicted it**), and `CAPEX_PUBLIC_SUPPLY_SHARE`, which was **DEAD — imported and read nowhere.**
     - The carrier's floor was fuel and crew only — what a ship costs to SAIL, not what it costs to HAVE — so a balanced freight market cleared where no carrier could replace a hull, and the fleet was consumed with nothing saying so.
177. **CAP — capacity read off PP&E: tried and reverted, and the reason is §7.158's rule, not a flaw in the design.** A walked rate accumulates every error it is given; **a plant is not a rate, it is what the capital can make.**
     - Measured: it costs ~0.3pp of employment and puts JPN over the band. **Not a bug in the change.** Net PP&E is genuinely falling because the capital-goods sector supplies ~8% of the capex bid for, so tying capacity to it states that immediately instead of smoothing it away.
     - **So the walked rate is STANDING IN for the missing supply, and a stand-in may not be deleted before the mechanism it stands in for exists.**
     - One real defect found: `grossPPEUSD` is undefined at week 1 and stage 05 runs BEFORE stage 08 sets it. Nothing reads it there today, but the next one that does must carry the fallback.
178. **CAP/rule 3 — the capex categories' demand was a FROZEN SEED PLACEHOLDER beside the firms' real capex.** A frozen level is still a representation, and it is the one that sizes the industries: 54.0B/yr built against 83.6B/yr bid. **The comment was right about the bids and wrong about the level.** Gap narrows 1.55x → 1.29x.
     - It does not close entirely, and the residue is the SEED: capacity was built off the old frozen number and moves slowly, so an honest level fixes the SIGNAL before it fixes the stock.
179. **COH2 — the beneficiary liability reversal: tried and reverted, and TWO CONSECUTIVE REVERSALS ARE THE FINDING.**
     - The defect is real: `beneficiaryLiability = assets − equity` with equity set ONCE at the seed, so **households' claims on institutions are an accounting residual of the institutions' own asset growth.** In reality a pension fund is as big as the entitlements it owes, and the residual should be its CAPITAL.
     - Built as designed; measured **+0.9pp unemployment, JPN over the band.** The channel is real.
     - **THAT IS THE SECOND CORRECT CHANGE IN A ROW THAT COULD NOT LAND.** Both are right, both trace to a DIFFERENT missing mechanism, and both trip the same tripwire. **The economy runs at ~29% unemployment, so every correct change that removes a cushion crosses 30%, and the band has become the binding constraint on what can be built.** That is not a reason to widen the band or to stop making correct changes.
     - **The other half of rule 18's argument: when a number is so far out that it BLOCKS unrelated mechanism work, closing the gap IS mechanism work.** The 29% is the accumulated cost of the supply-side rows.
180. **SUPPLY/CHAIN — investment was allocated two different ways, in all three copies of the identity.** The seed spread `I` across EVERY corporate-bought good by buyer mix; firms bid capex only into the five CAPITAL-GOODS categories. **Two allocations of one number**, so those industries were built for a fraction of what would be bid at them.
     - A corporate purchase of a NON-capital good is INTERMEDIATE demand, which the Leontief solve already produces from the recipes, so putting it in final demand as well counted it twice from the other side.
181. **DEM — people age now. A real age structure, and the life-cycle savings rate falls out of it.**
     - What it replaced was not an age structure: four shares walked by stated drift constants and renormalised — nobody aged, four numbers moved — implying a **33-year retirement and a 133-year working life.**
     - `ageDistribution` is population share by single year of age; deaths leave at the **Gompertz hazard for their own age** (two biological primitives replacing a fitted proxy). The four stage shares are BANDS of it, so there is one representation of who is how old.
     - **The seed's age structure is the STATIONARY distribution implied by the hazard and the region's own birth rate**, so a region whose fertility the transition put low opens OLDER. Regional difference as an outcome, not a table.
     - **THE PAYOFF: the life-cycle savings rate is derived with no coefficient** — `r/(w+r)`, and since `w + r = 1` it IS the retired share. That is what §7.165 was missing: a buffer rule alone has no motive that survives a stationary economy.
     - Restored now their blockers closed: capacity off PP&E (§7.177) and the beneficiary-liability reversal (§7.179).
182. **COH2 — the pension flows are the age structure's now.** Contributions came off the WHOLE sector's income, which charges retirees a pension contribution. And a stated 5% benefit rate asserted a twenty-year retirement as a flat drawdown and could not respond to an ageing population; a fund now pays out over the years its members actually have, integrated from the Gompertz hazard.
183. **HSG — the house price clears. Every term in what it replaced was stated:** a stated speed, a stated credit nudge, a clamp on the outcome and a stated 400,000 level.
     - **A house sells at what the MARGINAL BUYER can pay.** Rank the tiers by affordability, walk down until the week's supply is absorbed, and **the price is what the last buyer needed to bid.** More supply reaches further down and prices lower; a rate rise cuts every tier's capacity.
     - The floor is the construction sector's own cleared build cost, not a number.
     - **It closes the loop §7.160 left open:** the price is now SET by what households can borrow, so affordability and the price determine each other and the DSTI limit is live in both directions.
184. **CRD-R1 — a rating is not two ratios.** Leverage and coverage stay the spine; each further measurement moves it by at most one NOTCH at that measurement's own natural break — scale against the median issuer, customer and supplier concentration above a half, a maturity wall the firm's cash cannot cover, earnings volatility above a quarter.
     - **Every argument is a number the simulation already produces for another purpose**, and an absent field applies no notch — which is what "no opinion" means, not a default assumption.
     - `09-concentration-risk.ts` produced flag STRINGS for the UI, and **a rating cannot be notched off a sentence.** It now publishes the largest counterparty share as a NUMBER.
185. **G3a/G3e — the dealer desk becomes a named bank's business, and the equity float becomes real.**
     - The "dealer" was three things and none a business: an engine residual, an array on the region, and a P&L split by market share. **No bank decided to carry it and no bank's capital constrained it**, so once SETL6 made the cash side explicit its counterparty was the BOUNDARY.
     - **The fix is not a new mechanism, it is deleting a special case.** A desk is an ORDINARY PARTICIPANT with a market maker's schedule — neutral at the printed level, full a spread away in its favour, flat a spread away against it. **The WIDTH of the schedule is the book's own bid-ask, which the book already charges**, so inventory-driven price discovery needs no new parameter.
     - Cash inventory consumes the leverage ratio one-for-one. **Before this, a desk's book consumed NOTHING, which is exactly what let a position with no capital behind it absorb any imbalance.**
     - One stated parameter added, **and note the BASE:** a share of unused headroom would let the desk take a quarter of what is left every week forever, converging on the whole sheet. Deliberately NOT merged with the FX desk's identical-looking 0.25 — **one number meaning two is the defect this project deletes.**
     - Three things it surfaced: 07c read `pos.bucketKey` on a row carrying `tenorKey`, so the dealer's book **had never once been subtracted** from the reservable float; 07e charged NO FEE because the engine's spread came back share-denominated and the adapter dropped it, so equity trading was free while every other book paid; and 07e's float was `sharesOutstanding` — the whole company — against bidders whose mandates keep them far below it.
186. **G3c — five posted bank prices become five decisions the bank makes.**
     - The wholesale spread was 40bps for a sound bank and a breaching one; it is now the bank's own cleared OAS.
     - **The deposit rate was `policyRate × 0.45`** — an observed pass-through, identical across banks, and THE rate almost every week despite being described as a floor. A bank now pays the cheaper of what the deposit is worth to it and what the depositor could get, on the share of its base actually in play. **Consequence to watch, not to pre-empt: a liquid bank whose depositors are not leaving now pays ZERO** — the mechanism's own answer, possibly wrong for a reason the model has not built (deposits buy payment services).
     - The ROE hurdle met its own file's stated exit condition — the fourth such condition found satisfied.
     - **The underwriting fee was a three-line table.** Quoted per deal from the desks' spread plus a week's move on the residual, **the derivation reproduces all three of the table's levels from mechanism** — the strongest evidence yet that a posted schedule was a mechanism in disguise.
     - The lead bank was a stable hash of the issuer id: nothing the bank did won the mandate and no issuer ever moved.
     - **The primary market became a firm commitment** — the last unfunded acquisition on that path.
187. **G3b — the player's dealers were the second dealer system; there is now one.** Three invented counterparties with no balance sheet, a fill price computed inside a React component, earnings credited to the regional aggregate with no cash leg, and six of eight asset classes moving no inventory at all.
     - A dealer's AXE is where its desk is actually long this week, read off its own inventory — **which is what an axe MEANS. The discount is not granted, it falls out.**
     - One more duplicate went with it: each book's bid-ask was a private constant in its adapter AND a different number in the player's dealer table.
188. **REPO — a repo becomes a contract with two named parties, and secured funding gets a term.**
     - **The premise the row corrected first: repo already CLEARED. What it was not was an asset class.** A scalar beside books that itemize everything else; who lent to whom was unknowable, so the cash leg had no counterparty and the collateral leg had no owner.
     - Stored ONCE with both parties named, every scalar derived. **`AssetType.REPO` and an `ItemizedHolding` row were deliberately NOT added: the checklist in §5 was evidence of a defect, not a specification, and satisfying it literally would have re-created the duplication.**
     - The standing facility is a lender, not a separate scalar. Maturation is per contract — `last week's scalar × this week's rate` could only ever describe an overnight book.
     - **Collateral is specific.** The blended share it replaces had thirty-year paper withholding the two-year book from the auction that prices it, and could hide an over-pledge behind a large position in another bucket.
     - **The term split is measured, not stated:** what a bank is simply ROLLING is structural funding and goes to term; the increment is this week's dip and goes overnight. **The window is not in the term book**, so a term need the private market will not fund falls back to overnight at whatever that costs — a funding squeeze, which the model could not previously have.
     - **REPO4 turned out to be mostly already true and the row says so rather than inventing work for itself.**
189. **XB6 — the FX auction was running on the wrong currency, and that was the whole geometry.** The engine auctions a float to BUYERS, so a bigger float always clears LOWER — right when the float is the currency being SUPPLIED. The adapter always made the stat `quote per base`, so whenever clients were net BUYERS of the base **the more it was demanded, the lower its rate had to go.**
     - The `1 + sign × pct` shift could only ever move the LEVEL, not the SLOPE. **That is §7.77's −8.01% print 38 weeks in 40 and §7.82's EUR escaping upward: one defect, both directions**, which is why neither re-measurement could pin it — the sign of every flow was correct and the number still came out wrong.
     - **The fix is one sentence: auction the currency being SOLD.** The two central-bank defences collapse into one schedule for the same reason.
     - Two one-way flows went with it: the desks' whole book offered at any price every week, and a residual warehoused by capacity SHARE whether or not the capacity was there.
190. **HF — four funds instead of one, and leverage gets a lender.**
     - **One `HEDGE_FUND` type did every strategy at once** — not a fund, four businesses on one balance sheet, and it meant an equity long-short book was taking a view on the yen.
     - **`LEVERAGE_ALLOWANCE.HEDGE_FUND` was the last infinite-supply constant of its kind:** a share of assets a fund was allowed to borrow by nobody, from nobody, at no price, and never withdrawable. Now a prime-brokerage line from a NAMED bank at a derived haircut, widened by the fund's own concentration **because a concentrated book is not only riskier but slower to sell, and the broker is who would have to sell it.**
     - What it draws is its DEBIT BALANCE, so the line CONSTRAINS rather than drives. **Withdrawal is the point, and it now exists.**
     - The FX elastic side stopped being three chosen numbers: **a market's depth is now its own property.**
     - **THE ONE THING THE REVIEW GOT WRONG, checked rather than inherited.** `HOME_BIAS_BY_ENTITY_TYPE` was recorded as "a mandate LIMIT acting as a preference". It is not — it feeds a CEILING, with the fill decided tactically. **The bound is already a bound.**
191. **DER — a swap market, and a cross-currency basis that clears.**
     - IRS first, because its two-sided demand already existed and nobody had asked for it. The receive-fixed side's **reservation is the government bond of the same tenor, because that is the alternative it already has. That single sentence is why a swap spread exists at all.**
     - **It is the first CROSS-MARKET basis this model produces.** Every other price it prints is a market's own opinion of itself; this one is two markets compared, **so it is the first number that can say they disagree.**
     - The cross-currency basis was rule 15's clearest surviving case: a ceiling that was an observed crisis-era level times an invented split. **That is the post-2008 mechanism the formula was imitating, and it is cheaper to write than the imitation was.**
     - What a hedger will pay is derived: the currency's own volatility times the share its mandate hedges.
192. **G5 — a default resolves, and the last conservation violation closes.**
     - **What it replaced was an ABSENCE, not a formula.** A defaulted issuer stopped being priced while its holders kept the position at its last mark forever. **The claim outlived the borrower.**
     - **Nothing states a liquidation horizon**, which was the trap. Each asset leaves at the rate the market that would buy it absorbs it, and **the discount is the buyer's own required return over the time its money is tied up — so the slowest asset is the cheapest**, and recoveries disperse by asset-heaviness without anything saying they should.
     - Recovery is an OUTPUT, displacing the 0.4 prior in proportion to experience: one resolution does not overturn a prior, twenty do.
     - **Both folded constants died with the mechanism, which is the test that a mechanism is real.** A contagion coefficient added basis points to a cleared price by formula; contagion is real losses landing on real books. And the 0.10 recovery floor went: **an issuer with nothing to sell recovers nothing, and that is the answer, not a bound.**
193. **NAT — the seed stopped importing prices, and weather stopped stating outcomes.**
     - **The rule-4 violation was in the multiplication, which is why it survived a header denying it.** Three factors multiplied out to eight recognisable real market prices, with the scarcity index back-solved to produce them. **The tell that proves it: HEAVY crude seeded ABOVE light, where real heavy grades trade at a discount — an import faithful to the level and not to the physics.**
     - The primitives are physical (extraction cost per tonne, saleable units per tonne); the seed price is their quotient, the marginal producer's own cost. **The prices are not the observed ones and are not meant to be.**
     - Weather got a calendar and a GENERATED geography: exposure is read off what each region actually produces. **What can hurt you follows what you do.**
     - An event now cuts a YIELD and the clearing ratio prices the shortage; `gdpImpactPct` and `inflationImpactPct` — 14 writes, 0 reads — deleted.
     - One thing the reseed exposed: **the pledge follows the paper.** Collateral that no longer exists is called and the contract it secured shrinks — a margin call on collateral, which the model could not previously have.
194. **CAL — interest accrues to the holder and pays on the date; and the swap curve gets a benchmark worth the name.**
     - **A revert was started and it was the wrong move — the disagreement WAS the finding.** The first attempt put holders on coupon dates and issuers on a smooth accrual, and the reflex was to undo the holder side. **What the drift actually said is that the accrual had nowhere to live.**
     - Without it, paying whoever holds on the date hands a one-week buyer a half-year of interest: a transfer the auction never priced, and a standing incentive to own paper across coupon dates.
     - **It accrues to the register** — including a holder that has since sold out, because it earned it. **The P&L stays smooth on both sides; only CASH is lumpy.**
     - **The floating leg paid `policyRate`** — an administered number, so the swap curve was a term structure on a rate nobody transacts at. It now pays the cleared GC repo print compounded into an index, **which makes these OIS**, and the swap spread finally means what a swap spread means: secured money against the government's own yield at the same tenor.
195. **THE SETTLEMENT SWEEP — every line that moves cash or an asset, read, and the bypass measured.**
     - **The measurement first, because 02b was already computing it and nobody printed it.** Its `reconcileUSD` invents the reserves behind any holder balance that moved without a payment instruction: **12.2B gross over ten weeks, 11.6B of it INSTITUTIONAL. The plug is exactly why this was invisible** — it keeps the per-bank identity from drifting, so every check passed while a second, unrouted way of moving money survived beside the first.
     - **ASSETS ARE CLEAN.** No asset moves without its owner moving it.
     - **CASH: 25 sites outside `settlement.ts`, all read. Every one is TWO-SIDED** — nothing creates money from nothing — but most move both balances DIRECTLY instead of posting an instruction.
     - **Repo treats coupons correctly, and now it says so.** A pledged bond stays on the borrower's book and encumbrance is a separate face amount, so the coupon accrues to the collateral GIVER — pledge semantics, single-counted, with no manufactured payment needed.
     - **What this does NOT say:** nothing here is a conservation break. What it says is that the settlement layer is not yet the ONLY way money moves, and that there is now a number on it to watch down.
196. **CASH — the settlement layer gets a second cycle, and the meter gets corrected.**
     - **The migration had stalled for a STRUCTURAL reason.** Settlement ran once, mid-week, so every stage after it had nowhere to send an instruction. **A week has two cycles now**, an intraday one and a close, the way a day does. That alone recovered the estate distributions, which were already written as instructions and were being silently dropped.
     - Three defects the routing exposed: the wholesale residual netted maturities out of the liabilities while their cash was still on the sheet (**principal nets out; interest does not**); **`applyBankFundingSplit` was a second, incomplete copy of the balance-sheet identity** and whichever ran last won; and the central bank reconciled before the close.
     - **THE CORRECTION, and it is mine.** §7.195 said the reconcile was the size of what bypasses settlement. **It is not only that** — it also absorbs a `Math.max(0, cashUSD)` clamp, and something was sitting behind it.
     - **A FUND IS OVERDRAWN, AND THE PLUG WAS PAYING FOR IT.** One equity index fund's cash is −1.4B at week five, −3.8B by week ten, re-plugged weekly — **the defect paying for its own cover, which is why nothing ever caught it.** An institution's cash is a bank deposit; nothing lends it an unsecured overdraft.
     - **One routing deliberately NOT kept:** the insurers' household leg DEFERS inside settlement while the insurer's lands at once, so routing it put the two ends out of step. Recorded rather than forced.
197. **OWN7/CASH/PUB — the UNMODELED boundary goes from twenty-five reasons to six, and breaks.**
     - **The question that started it: "why are there still holders the model doesn't name?"** 25 lines, the four biggest `<book> dealer inventory` — securities bought from, or sold to, nobody, at 16B gross over ten weeks.
     - **THE FLOAT.** 07b and 07d still auctioned the WHOLE outstanding on OWN2's claim that the instrument was already net of what does not trade. **Measurement falsified it.** All five stock books now use the rule 07c and 07e already state: the float is what the participants in THIS book hold between them.
     - **THE SEED WAS MINTING CLAIMS BEFORE WEEK 1.** A 45% opening share of a debt stock counting every tranche, placed entirely on public FIXED paper: institutions opened holding **132% of the USA corporate bond stock.** The desks hid it by going short into the boundary.
     - **THE RESIDUAL DEALER IS DELETED.** Every book handed `float − allocated` to a dealer funded by nobody — which looked like market making while the float was the whole issue. The five stock books ration **BOTH SIDES** now, and **a seller that finds no buyer keeps its paper**, which is a far more honest illiquidity than an invisible bid. The flow books keep the residual, where the float is a real inelastic order from outside the participant set.
       - **The flag has to travel to the worker pool**, which rebuilds the packed struct field by field — a parameter left behind there runs a DIFFERENT market in the parallel path with nothing to catch it.
     - Then the rest, each two halves of one payment with neither pointing at the other: **corporate treasuries MINTED their bills**; trade credit already knew both parties (**and the invoice is cut EX-WORKS**, because the freight was paid to the carrier at shipment); **the CALL PREMIUM was paid TWICE**; the primary market crossed the boundary in both directions at once; and the bank net income accrual was settling income already booked against equity.
     - **A MATURING SOVEREIGN PAID THREE HOLDERS NOTHING** — foreign institutions filtered out, the desks' own inventory never redeemed, the treasuries not repaid at all.
     - **PUB — the treasury auctions its paper.** Stage 11 credited the whole issue to the TGA the moment it was written, and under the float rule that paper could never be bought. **What still finds no buyer by the time it matures is simply gone: a debt nobody holds is owed to nobody, and the treasury was never paid for it either.**
     - **THE BOUNDARY IS A HARNESS VIOLATION NOW.** `BOUNDARY_FRONTIERS` declares every reason that may cross, with its owner; anything else fails on the week it appears. **It is a list to shorten, never a place to add a line to make a run pass.** It caught three defects on its first run.
     - **DAMPER 890 → 1030 persistently bound. A REGRESSION, and the honest shape of this whole sweep:** floats are what holders actually hold, the treasury's supply is real and one-way, and neither is absorbed by a dealer nobody named. **The pressure was always there — the residual dealer was hiding it.** Do not widen the damper.
198. **CP and XB3a-2 — the last unpriced book, and the carriers' missing cash leg.**
     - **CP arrived with the bills in WS5 and got the ISSUER half of a market and none of the buyer half**, because its buyers — the money funds — did not exist until WS7. So: the SIZE was the issuer's alone; the market's only voice was a BINARY GATE (**real funding stress arrives as "it rolled, but forty basis points wider and only sixty per cent of it", and that state was inexpressible**); and the HOLDER had no name.
     - **A fourth, quieter and worse:** CP is a FIXED tranche, so **the CP coupon was being paid to the CORPORATE BOND holders of record** — a register whose float explicitly excludes CP.
     - It clears now, with its own register and its own place in the estate waterfall (senior unsecured, and **its holders are money funds, which is exactly why a CP default is systemic and a bond default usually is not**). **Its walk-away is the REVOLVER**, because no treasurer pays more for paper than the committed line beside it costs. **Credit policy is a SIZE, never a veto.**
     - **THREE DEFECTS IT EXPOSED, and the first is the important one:**
       - **A DESK'S PRIOR POSITION WAS CONDITIONAL ON THIS WEEK'S FLOAT.** Once the float is "what the participants hold", a book that sets it AFTER the desks are built hands them zero, and the apply pass then deletes the position with no cash leg. Measured: a 2.34B desk position entering the week as 0.02B. **A position is a FACT; it is declared before any float test.**
       - **Every book was sizing its desks against the PRE-SHRINK float**, so each desk got capacity against an issue that is not for sale.
       - Opportunistic deleveraging was retiring CP, leaving holders with a claim on nothing — caught by the new ledger row within one run.
     - **"Why are carriers not built into the corporates framework?" They ARE** — real fleets, real fuel at the refined-product price, real crew, listed equity, a home bank. **What was never wired is the CASH:** the buyer's freight leg paid the boundary and the carrier's freight arrived from the boundary — **two anonymous ends of one payment whose parties are both known.** It is also ONE quantity now: a carrier's revenue was re-derived in the CARRIER's money while buyers were charged landed cost in THEIRS.
     - **The boundary is FOUR reasons, from twenty-five when this sweep began.** CP: 623 issuers, 16.1B outstanding, ~20bp over the cleared 13-week bill. Damper 947 (it peaked at 1042 before the desk-position fix, **which is how that bug was found**).
199. **SUPPLY/CHAIN and COH — the seed had a circle in it, and the household balance sheet had one number doing four jobs.** Six changes, foundation tier. **NONE OF IT IS MEASURED** (the user directed the work to proceed without a run).
     - **THE SEED'S INVESTMENT FIXED POINT, CLOSED.** A firm's revenue comes from its category's demand seed and its capex from that revenue, while `I` — which sizes the capital-goods half of that same seed — is the sum of exactly those capexes. **The seed resolved the circle by using a different number on each side.** `solveSeedInvestmentFixedPoint` iterates the two to 1%; the map is a strong contraction because capital-goods makers are a slice of the economy.
       - **The RNG is rewound to the stream position as it stands before the first generation**, so the surviving universe is bit-for-bit what a single generation against the converged vector produces. **That detail is the whole reason this was safe to do.**
     - **TWO PLAN ROWS WERE STALE AND ARE CORRECTED HERE.** Capacity-off-PP&E was already restored in the tree and DEM had closed; neither row said so. **Read the code before believing a row's state.**
     - **COH1 — spendable now and accumulated are two stocks.** One stock drove the deposit, equity, private-business and institutional-claims splits at once, off a number that tracked only the saving FLOW and never where it went. **A tier that put everything into a house and a pension looked exactly as liquid as one holding cash.**
       - **Dissaving drains the buffer first**, which makes forced selling the END of a squeeze rather than its beginning — a mechanism that could not exist while both stocks were one number. And it makes the wealthy-hand-to-mouth middle CAUSAL rather than coincidental.
     - **COH2 — the pension contribution is the saving households already decided to do.** The life-cycle half of saving was accumulating into the household's own stock **while a flat 9% of the whole sector's income went into the pension funds beside it.** Two representations of one motive, and the stated one was larger. A cohort that cannot save contributes nothing, **which is what a contribution holiday IS.**
       - It corrects COH1's split made an hour earlier: **a saving flow divides by MOTIVE, not by a portfolio weight.**
     - **COH2 — a pension fund opens as big as what it owes**, derived from the age structure; its capital is the SURPLUS against that.
     - **COH3 — the identity assert is deleted, because it could not fail.** Every term on both sides came from the same four constants: a tautology whose real effect was to pin the seed to an identity the model stops using in week 1.
200. **HSG — the last two constants, and a third row that was already done.**
     - **THE PRICE ALREADY CLEARS, and the §4 row still said it did not.** Third stale row of the day. **Read the code before believing a row.**
     - **Every bank quotes its own mortgage now.** One spread over the 10Y had every bank charging every borrower the same, in a file whose own doc says a margin is quoted by the bank's own credit arithmetic. **A bank whose book is underwater quotes wider**, so a credit tightening reaches housing as a RATE rather than as the stated credit factor the price walk already deleted.
     - Turnover is one sale per tenure plus the owners who can now afford to trade up.
201. **CDS clears, two clamps go, and the overdrafts are closed.**
     - **`cdsSpreadBps` was `oasSpreadBps + a random draw`, bounded to [10, 5000]** — not a price but a decoration on another price, with a clamp on each end. Nothing traded it and a bank could not hedge a credit exposure at all: the only way to reduce a concentration was to stop lending.
     - **The float is the protection somebody NEEDS** — the exposure a lender's capital does not let it carry against one name, measured off its own book against the large-exposure limit. The sellers' reservation is the identical arithmetic the corporate bond book uses, **because it is the identical risk. What differs is the FUNDING, and the difference between the two prices is exactly what a basis is.**
     - **A firm with no earnings rates off liquidity.** With no earnings the two ratios carry no information, so the rating rests on whether the firm can cover its debt from cash and its committed line.
     - **An option is repriced at the name's own volatility.** `pos.impliedVol || 0.3` put a flat 30% on any option whose row lacked one. **Rule 3 on the way:** there were TWO realised-vol estimators and one was private with its own 0.16 fallback, so a market with too little history reported as sitting exactly at its baseline — which reads as "no excess vol" whether that is true or unknown. One estimator now, with no fallback baked in.
     - **ETF2 — the overdrafts, and the plug that was paying for them.** `min(want, cash)` is the right test applied inside a loop over FUNDS, so **the same dollar was budgeted once per fund**; and nothing checked that a fund could pay a redemption. **Recorded rather than pretended: the real answer is IN KIND.**
202. **G5's two remainders, and HF — an equity SHORT that borrows, locates, recalls and squeezes.**
     - **A firm draws its committed line before it defaults.** A revolver is a promise the lender cannot withdraw, and the model let a firm run out of cash beside an undrawn one. A default is now a firm out of *committed credit*, not one out of cash on a Tuesday.
     - **Private companies change hands**, closing the capital-recycling loop at the end that was open.
     - **HF — the short was a label on an enum.** Nothing could express a participant who profits when a price falls, so every equity schedule sloped the same way and the only bearish act available was to own less. **A short is three obligations:** BORROW (shares against cash collateral plus a fee, so a fund cannot short what it cannot fund), LOCATE (**a borrow the auction does not fill is a short that does not happen**, which is what "hard to borrow" means as an outcome), and RECALL/SQUEEZE (**lending does not shrink a lender's position — the shares leave, the exposure does not** — so a position below what it was at strike is a sale, and the buy-in enters 07e as a mandated core with no reservation price. Forced buying lifts the print, which widens every other short and reprices the borrow auction against a lendable base that just got smaller. **Nobody wrote that loop down; it falls out.**)
     - **No new free parameter:** a lender's fee is the capital its one-week gap consumes at its own required return, and a short's size is the mirror of the long schedule the same fund already runs.
     - `stockLoanNetUSD` nets each party's contracts the way `repoLentUSD` nets the repo book, so a short's running P&L is on its balance sheet rather than nowhere. **A borrowed share is delivered, not duplicated.**
203. **DER closes: a futures curve that clears, and the corporates in the hedging book.**
     - **The commodity curve was spot times a constant**, with the convenience yield seeded once and never touched — so it could not back off when the model's own commodity market went short. **The convenience yield is what a traded curve IMPLIES, and here it was the input.**
     - Both sides of the book are industrial and were already in the world: producers selling forward, recipe-consumers hedging forward requirements. **Which side is bigger sets the SHAPE** — backwardation and contango become the outcome of who needed the hedge more.
     - **The storage desks hold the top of the curve, and that is not a clamp:** a print above spot plus financing plus real storage is free money to anyone who can hold the physical. `PHYSICAL_STORAGE_COST_ANNUAL` is a property of the SUBSTANCE — energy boils off, metal sits in a shed, grain rots.
     - **The corporates were measured and could not act.** Invoice FX exposure sat on the books every week while the forward market had one client population. They now bid in the SAME auction against the SAME desk capacity, **so a corporate hedging widens the basis for the fund managers** — which is why they had to be IN the book rather than beside it.
     - **One owner for "how much variance has this balance sheet room for":** `exposureToHedgeUSD`, with three callers.
204. **COH4's savings destination: the split was already being made, one file away.** `HOUSEHOLD_SAVINGS_TO_DEPOSITS_SHARE = 0.3` had convicted itself in its own comment, and COH1 started making exactly that choice one file away while the banking stage went on multiplying by 0.3.
     - The constant is the SEED and nothing else; both readers take the measured share, closing the duplicated-constant shape at the root rather than keeping two copies in sync.
     - **What it buys:** bank funding competition now responds to households changing WHY they save. An ageing region contributes more to pensions and less to deposits, so bank funding tightens and the deposit rate rises.
205. **Three rows closed: the distribution tier, the credit-tier join, and the ETF's basket.**
     - **IND16 — the trap was the design.** A household already buys `facilities_and_logistics` AS A GOOD, so a channel margin on top would pay the same sector for the same work twice — **and neither number would look wrong, because both are real revenue with a real payer.** So the household's distribution spend MOVED onto the goods it is spent distributing.
     - **The margin is the good's own physics:** the cover the channel holds (the lead time it bridges, capped by shelf life) at what holding it costs. **A service has no channel at all — the physics does the exempting, and there is no list of exempt categories.**
     - Three price levels, each with a real payee. **The CPI reads the shelf price, because a consumer price index prices what a consumer pays.**
     - **A fourth declared frontier closed: warehousing has a seller.**
     - **CRD × COH — two partitions, one axis.** Credit tiers and wealth tiers are two partitions of one population, so they go on one axis rather than being mapped: the BUFFER. That retires four stated delinquency multipliers and a debt split by head count that had a subprime and a super-prime household owing the same amount.
     - **ETF2 — in kind is why an ETF cannot be run on.** The fund delivers its pro-rata slice of everything it owns, so no money has to be found. The household leg stays cash, because a household cannot take delivery of a basket.
206. **The ETF share book, the tax rate's owner, and two untrue comments.**
     - **An ETF share has a price now** — the last thing `unmetFlowShare` was standing in for. **No AP creates below net asset value**, because creating at a discount is selling a dollar for less than a dollar, which holds the top of a discount as a participant's price rather than a bracket. **What bounds a premium is a price the model already sets:** the cost of assembling the basket yourself. `unmetFlowShare` stays as the QUANTITY beside the premium's PRICE.
     - **A firm reported 21% tax and paid 31%.** Three tax rates with no owner between them; the P&L and the payment disagreed about the same liability, and the government's one tax lever could not reach corporate taxation at all.
     - **Two doc comments that were not true, corrected.** §7.201's CDS module claimed the bank's large-exposure measurement as "the consumer 09-concentration-risk has never had". It is not: that stage measures TRADE concentration over the contract book, a different exposure on a different book, and it found its consumer in CRD-R1's rating notches.
207. **HC3b — revenue is what was sold, not a formula about the category.**
     - The formula in full, so it is not rebuilt: last week's revenue grown by a lagged category rate, plus a random draw, plus inflation times a stated sector pricing beta; the weekly rate clamped to ±5%; smoothed 90/10; then corrected downward by half of unsold production and halved again on default. **A number about the CATEGORY with a real-sales correction bolted onto it.**
     - **And it was revenue with no payer, which the model already said out loud.** `non-auction operating receipts` — the largest declared boundary line — is *exactly* `revenue/52 − what settled`. **The line was not a gap in the goods market so much as a readout of the formula disagreeing with the auction.**
     - A sale is a buyer and a seller: revenue is `salesUSD`, annualised at the same measurement weight a pool's receipts use, which now has one owner.
     - Gone with it: `SECTOR_PRICING_POWER`, the company-level demand-shock lag buffer, and the commodity-price growth adjustment (**a producer's revenue rises with its commodity's price because it SELLS units at that price**). **The 50% default haircut is deleted too, and that one is a claim:** a defaulted firm's revenue should fall because its customers stop buying, and if nothing in the auction makes them, that is a finding for the estate work.
     - **DECLARED RELABEL:** the formula's `random()` is gone, so the stream shifts and same-seed worlds will not match anything measured before this commit.
208. **The four deferred items, and the rule that answered each one.** Each had been carried as a
     JUDGEMENT rather than a blocker. In every case the judgement had already been made — in §1,
     before the item existed — and what was left was to notice which rule it was.
     - **`TIER_WAGE_MULTIPLIER` — rule 19's caveat, now satisfied.** A shape parameter must not be
       deleted before its mechanism exists; §7.173's rent-sharing and §7.174's experience premium
       built it, and §7.174 already recorded that deriving "would be MORE correct" because **32.5x
       WITHIN one occupation is not a plausible wage fact** — it was the whole income concentration
       crammed into a wage multiplier while capital income was measured separately beside it. The
       tier multiplier is now the band means of the JOINT distribution of `(1 + return to
       experience × tenure) × firm premium`, over the tenure strata crossed with the real
       cross-section of firm wage indexes. The constant survives as a SEED for the opening
       condition and nothing else.
     - **And the band operation has ONE owner (rule 3).** Credit tiers on the buffer axis and
       wealth tiers on the wage-premium axis are the same operation — two partitions of one
       population, joined by ranking one and cutting it at the other's shares. `PopulationNode` +
       `bandMeansOverDistribution` in `domain/household-credit.ts`; both callers read it.
     - **The wage LEVEL — rule 19, plainly.** The derivation existed in §6.1 and every input
       existed: value added splits into labour compensation and gross operating surplus, and the
       surplus must cover depreciation plus the return the capital's owners require, so
       `labourShare = 1 − (1/life + cost of capital) × (capital / value added)` per sub-unit,
       averaged over the registry. Probed at 0.76–0.81 against the 0.62 it replaces — inside the
       0.64–0.88 band §6.1 predicted, which is the derivation checking itself.
       - **The cost of capital in it is STRUCTURAL, not the policy rate** (rule 3): the cyclical
         movement in wages is the labour market's own `wageIndex`, and putting the cycle in twice
         would be two representations of one thing. `national-accounts.ts` uses the same
         derivation at a reference rate, so `HOUSEHOLD_CAPITAL_INCOME_PER_WAGE_DOLLAR` is no longer
         defined against 0.62 while wages are set near 0.79.
     - **The household bid premium — rule 15, and the two derivations were both right.** They
       differed by 100x because **the defect was the SHAPE, not the numbers**: a household bid was
       one step — a quantity at a ceiling — and a step cannot express a demand curve, so one
       derivation was the reservation for the FIRST unit and the other for the MARGINAL one, and a
       step has only one slot for them. So the household posts a SCHEDULE, like every other
       participant in this model, and the premium disappears rather than being chosen.
       - **What is left to state is only how far the ladder REACHES, and the budget answers that:**
         a household can move discretionary spending onto a line it cannot defer and cannot move
         anything onto one it can, so a tier's ceiling is the reciprocal of the budget share
         committed at or below it — all measured, weekly, by the cohorts.
       - **The rungs are cut on the QUANTITY axis, not the price axis.** Equal quantity steps each
         priced `budget / quantity` make the staircase EXACT at every step rather than conservative
         between two prices: probed at K = 3/6/24 rungs it returns 10.00 units at a clearing price
         of 100 every time. A rung count is a RESOLUTION parameter (rule 19) and the answer must
         not depend on it — here it demonstrably does not.
     - **CAL — rule 12: build the WHOLE thing before measuring.** "Half of it measured is worse
       than none" is the deferral this rule exists to refuse. The whole thing is one party-keyed
       ledger, and it is the single writer of the receivable on both books, so the holder's claim
       and the treasury's payable are one number seen from two sides.
       - **The banks were the whole difficulty, and they are why the key is a PARTY.** A bank holds
         government paper on its own balance sheet, per tenor bucket, and is not on the
         institutional register at all — so an accrual keyed by holder id cannot reach it.
       - **A bank is paid as `BANK_SECURITIES`, not `BANK`.** Nothing is earned on the coupon date:
         the equity leg was posted the week the interest was EARNED, and the payment turns one of
         the bank's assets into another. Paying it as income would credit equity twice — §7.62's
         trap, in a new place, and the reason the reserve leg in the central-bank stage is now the
         settlement pass's alone.
       - **The treasury's expense stays smooth and its ACCOUNT moves on the dates**, and the
         difference between them is exactly the change in what it owes and has not paid. So the TGA
         is corrected by that change rather than by a second copy of the interest bill.
       - **Three holders are deliberately OFF the calendar, each for a stated reason.** A discount
         bill pays no coupon at all — its return is accretion, settled in the redemption leg, which
         is also why the corporate treasuries are absent. The central bank's coupon and its
         remittance are one week's round trip between the TGA and its own liability, so a date
         moves a number out of one side of its sheet and back. And the holders this model cannot
         name keep the boundary line that already says they are paid smoothly.
       - **Two dead paths went with it.** The register's `GOV_BOND` accrual hook was written in
         anticipation and nothing ever fed it — it could not have served this case, because the
         bank leg is the entire difficulty. And the institutional income pass still carried the
         memoised corporate-coupon helpers whose loop body had been reduced to `void`.
     - **The master file itself, under rule 11.** 7,247 lines to 1,272, at no cost in substance:
       §5 was carrying full designs for nineteen CLOSED projects, against the file's own rule that
       a closed item's section is deleted; §4's preamble still described a work order that had been
       overtaken; §2 and §3 described a model that no longer exists. **§7 keeps all 208 records and
       every number in them** — records are never renumbered and never dropped.
209. **THE FIRST RUN SINCE §7.199 — and the reason there had not been one.** The measurement debt
     was not being deferred. It was uncollectable: the harness died in week 1 of every run, at
     every commit going back well past this branch, on an assert that named the wrong thing.
     - **`0/0`, and NaN travels.** `fundingPressure` asks what share of the saving headed for a
       deposit walked to the money fund instead. §7.204 made the liquid-saving share a MEASURED
       number, and a week in which none of the saving was headed for a deposit makes it zero — so
       the question was `0/0`. **Nothing downstream stopped the answer:** NaN passes straight
       through `Math.max` and `Math.min`, into the deposit RATE, into the deposit STOCK — and the
       household deposit line IS that stock (HH4d, one number reconciled off the banks' own
       books). The whole household balance sheet was NaN in week 1, in all four regions, and the
       goods market's final-demand vector with it. **The guard belongs on the denominator:** a
       zero denominator is not infinite pressure. If no saving was on offer as a deposit, none of
       it can have walked.
     - **An assert that sends the reader to the wrong file is worse than no assert.** It surfaced
       as "the input-output matrix did not converge — some product consumes more than a dollar per
       dollar of output". The recipes were fine; the INPUT was NaN, and a non-finite input never
       converges either. The solve checks its input is a number now and names the caller's
       offending entries.
     - **A defect that hid for nine records because the run that would have caught it was the run
       that could not start.** Rule 12 says build the whole thing before measuring; it does not
       say the harness may stay red, and a red harness is not a measurement debt, it is a broken
       instrument.
     - **BISECTED, 3 weeks each, shocks off, from the reorganised plan forward.** DIST's tier wage
       multiplier is inert at the aggregate — identical prints to the baseline, which is what a
       change that redistributes within a total should look like. COH3's wage level owns the whole
       real-side move. COH4's ladder owns the whole price move. CAL's two new checks are green in
       every week: the per-bank identity carrying the receivable, and the treasury's payable
       against what its bank holders carry.
     - **MEASURED, 12 weeks, against the same run with only the NaN fix.** Violations 12 → 9 (the
       rest are the pre-existing fund overdrafts, worse on the baseline). Persistently bound books
       2145 → 1863. Unemployment 23.3/17.2/15.0 → 18.3/14.2/11.8, rising on both. GDP 0.75T →
       0.91T.
     - **Two corrections to COH4's ladder, both found by running it.** The reach is a multiple of
       the BUDGET and never of a price: bounding the bid at `last week's price × the multiple`
       looks equivalent and is not, because the reference moves with the price the bid itself
       sets, so the ceiling climbed at whatever rate it had just caused — measured, the level
       compounded 10% → 21% → 35% → 455% by week five. And the ladder is TRUNCATED at the
       reservation for the whole want: an untruncated `money / quantity` curve is unbounded as the
       quantity goes to zero, so the highest price the ladder POSTED was `rungs × the going
       price`, and where supply is short the top of the demand curve IS the clearing price. **A
       resolution parameter must not move the answer (rule 19), and that one moved it linearly.**
     - **What the run FOUND, recorded rather than patched.** Two live defects, both in §6.1 now.
       Neither gets a clamp.
210. **JPN's 66.8% — and §7.209's bisect was right about the commit and wrong about the cause.**
     The wage level did not break JPN's labour market. It moved the seed close enough to the edge
     for something else to fire, and **a bisect names a commit, not a mechanism** — which is worth
     recording on its own, because the row §7.209 opened proposed reading JPN's seed pools against
     the wage, and that would have found nothing.
     - **The measurement that turned it round: revenue was FLAT.** JPN's firms lost 3.72M of 3.72M
       heads while their revenue moved −0.9%, the same as UK and EUR. **A labour market destroying
       itself with nothing happening in the economy is not a demand story and not a wage story.**
       The wage indices confirmed it: JPN's pools moved 1.377 → 1.377 and its firms' offered index
       1.000 → 1.004, indistinguishable from the three regions that were fine.
     - **HOW EASILY A JOB IS FOUND HAD TWO REPRESENTATIONS IN ONE FILE (rule 3).** A quit is a bet
       on finding another job, so the quit rate moves with the rate at which a seeker actually
       finds one — and `labor-market.ts` computes that rate two hundred lines below its own quit
       rate: `f(θ) = A·θ^MATCHING_ELASTICITY`, concave, because a vacancy takes time to fill. The
       quit rate was LINEAR in tightness. **That is the same claim with an elasticity of 1** — that
       every extra vacancy finds its worker instantly — and it contradicted the matching function
       beneath it. It was not normalised to the rest point either, so a neutral market quit 5%
       below baseline.
     - **And tightness is `vacancies / seekers`, a ratio whose denominator the seed can drive to
       nothing.** JPN opens at 0.31% unemployment and a tightness of **215**, where the linear form
       put the WEEKLY quit rate at 1.69 — clipped to 1, so every worker in the country quit in week
       one and firms could rehire only what a single week of matching allows. That is the whole of
       the 66.8%.
     - **The same shape as §7.209's `0/0`, two commits apart: an unguarded ratio the seed drives to
       its limit.** The bank one printed NaN and stopped the world. This one printed a number, so
       it looked like economics for as long as anyone was willing to read it as one. **Prefer the
       defect that crashes.**
     - **MEASURED, 12 weeks.** JPN week 1 66.8% → 5.6%, holding in 4–9% rather than settling at
       ~25%; all four regions open at 9.1/3.2/2.3/5.6. Week 1 has zero violations. **The
       unemployment-band family is gone**; of the 11 remaining, 9 are the pre-existing fund
       overdrafts and 2 are a new EUR outlays row in §6.1. CAL's identity checks green every week.
       The price level is untouched — §7.209's other finding, and it belongs to the goods market.
     - **§1.20 was written between these two records and this is what it buys.** The cheap move at
       §7.209 was to put `LABOR_SHARE_OF_OUTPUT = 0.62` back, which would have hidden a quit rate
       that says everyone quits and left it waiting for whichever future change tightened a labour
       market next.
211. **THE 60-WEEK READ — the first long run in the project's history, and the answer is no.**
     §7.209 and §7.210 fixed the two defects that stopped the harness and the one that destroyed a
     labour market. Neither made the model right; they made it MEASURABLE. This is the measurement.
     - **647 violations in 92 families.** Zero in week 1, 36 in week 60 alone, accumulating
       monotonically. **The model is structurally sound and dynamically divergent** — those are
       different properties and only the first has been worked on.
     - **The price level does NOT settle.** 29% (w1) → 102 (w13) → 239 (w14) → 274 (w49) → 90
       (w60): not a level shift finding a new fixed point, and not a runaway either. It oscillates
       at an absurd altitude. §6.1's row asked whether it settles or compounds over 60. **It does
       neither, and that is a third answer worth having.**
     - **Nominal GDP doubles (0.75T → 1.47T) on a price level that trebled.** Real output is
       roughly flat to falling. The damper count is the one number moving the right way: 3003 → 613.
     - **EUR's labour market fails late** (65% by w60) and UK's prints 0.0% at w49. §7.210 fixed the
       quit rate; something else takes the labour market apart over a longer horizon, and it is not
       the same defect.
     - **The top families, in order, are where the next work is:** repo collateral over-pledged
       (XIVF 56x, THSY 54x — a bank pledging more of a bucket than it holds), fund overdrafts
       (PEF# 52x, and three equity funds), USA bank NIM out of band (41x), and **supplier market
       shares that do not sum to 100% in `agricultural_commodities` and `network_infrastructure`
       across all four regions (~120x combined)** — a goods-market accounting defect that has
       nothing to do with prices and had never been visible.
     - **CAL is clean.** Its cross-check — the treasury's payable against what its bank holders
       carry — trips **zero times in sixty weeks**. The per-bank identity breaks that appear from
       w14 are 6–39M on ~100B sheets (~0.0003%) and begin only once inflation is past 200%;
       unattributed, and not the sovereign receivable.
     - **What this read is worth:** items 1–7 of the measurement debt have been owed since §7.199
       and could not be collected, because the instrument was broken. They are collectable now, and
       the first collection says the honest thing: **the mechanisms are increasingly real and the
       OUTCOMES are not yet plausible.** Rule 12's "measure once at the end" assumes you can measure
       at all.
212. **THE OPTIMIZATION PASS — profile first, and the target does not come out of bug-fixing.**
     Target: under 300 ms per cycle. Start: **1872 ms.** After this pass: **1756 ms.** The gap is
     not made of defects, and this record exists so the next attempt does not re-derive that.
     - **ONE REAL REGRESSION, AND IT WAS MINE.** Stage 08 calls `getBaseAnnualWageUSD` twice per
       company — ~5,000 times a week — and §7.208's COH3 turned that function's body from a
       constant multiply into a walk of the whole registry. Worse, the derivation inside it ran
       `Object.values(INDUSTRY_REGISTRY).find(...)` INSIDE its own per-sub-unit loop, so one call
       was quadratic in the registry. Every input is fixed for a run, so the sub-unit→sector map is
       built once and both the labour share and the per-region wage table are memoised. **Stage 08:
       548 → 460 ms.** Same shape in `recipeIntensityOf`, which allocated and reduced an array per
       call for a constant.
     - **THE WORKER POOL BUYS NOTHING HERE, MEASURED.** `CLEARING_WORKERS` is opt-in and off by
       default. At 4 workers stage 05 goes 363 → 369 ms; at 8, 390. **This box has 4 cores**, and
       the pool's own gate only shards books of 32+ rows, so most sub-unit auctions never reach it
       and the ones that do pay sharding overhead against three real cores. §7.773's "sub-300 needs
       worker parallelism" is therefore **unreachable on this hardware at any amount of work.**
     - **WHERE THE 1756 ms ACTUALLY IS.** 08 at 460 (26%) is 2,500 companies × an 1,800-line body,
       and section timers say it is FLAT — no hot block, seven sections between 13 and 116 ms.
       05 at 381 (22%) is **entirely** the auction engine (measured: 333–370 ms of the 363 ms
       stage). estate-resolution at 176 (10%). The rest is spread across forty stages. **There is
       no remaining hot spot; there is a universe being walked.**
     - **§7.777's conclusion stands and this pass confirms it from the other side:** sub-300
       requires the state itself to move to columnar typed arrays. **And that is a WORLD RELABEL** —
       it reorders floating-point accumulation, so every number measured since §7.209 stops being
       comparable. That is a real cost now in a way it was not before, because §7.211 finally has
       a measurement programme running against those numbers.
     - **Indexed the estate stage anyway** (it rebuilt the entire institutional-entity array once
       per claim, searched companies linearly per claim, and re-derived per-estate scalars from
       full-universe walks). **209 → 176 ms, which is less than it looks like it should be:** the
       stage's real cost is the per-claim scan of one holder's book, and there were 11,000 claims
       open by week 16 — a number that is itself a symptom of §7.211's divergence. **Part of this
       cycle time is the broken economy, not the engine.**
     - Everything in this pass is **bit-exact**: 20 weeks of prints identical field for field.
213. **WHY 300 ms IS NOT A BUG HUNT — the four measurements that settle it.** §7.212 got 1872 →
     1756 by fixing defects. This pass got 1466 by fixing more, including a real correctness bug.
     Then it stopped guessing and measured the SHAPE of the remaining cost, which is the part worth
     keeping.
     - **The numerics are 70 ms.** `runClearingKernel` 22, `sortIndexByKey` 23, `accumulateShard`
       15, `solveClearingStat` 10. **Everything else — ~1,400 ms — is orchestration over the object
       graph.** Not one hot spot: the largest named function is 13% and the profile has a long flat
       tail across forty stages.
     - **Cutting the universe 4.4× makes it only 1.85× faster** (2,496 → ~570 firms: 1569 → 849
       ms). **So the cost is not "too many companies."** What does not shrink with the firm count —
       ~300 institutions, ~120,000 holding rows, the households, 37 sub-units × 4 regions — carries
       most of it. A smaller universe is therefore NOT a route to 300; it bottoms out around 800.
     - **Worker sharding is dead on this hardware, measured twice.** 4 cores. At 4 workers stage 05
       goes 363 → 369 ms, at 8 → 390. §7.773's "sub-300 needs worker parallelism" is unreachable
       here at any amount of work.
     - **The engine is allocation-bound**: GC is a steady 8.5–8.9% of every profile, and
       `--max-semi-space-size=64` alone is worth 7.5% with no code change at all.
     - **THE CONCLUSION, and it is §7.777's from the other side:** ~1,400 ms of pointer-chasing over
       2,496 companies, ~120,000 holdings and ~8,600 tranches cannot be reduced 5× by removing
       work, because there is no concentrated work left to remove. **It requires the state itself to
       stop being an object graph.** That is SCALE wave 2, it is a world relabel, and it now costs
       §7.211's measurement programme.
     - **A finding that came free and matters elsewhere:** the institutional register grows from
       32,278 rows at seed to ~103,000 DISTINCT positions by week 5 and ~122,000 rows by week 15,
       of which 15% are duplicate `(holder, instrument)` rows and 9% are under $1,000. §7.4 says
       the seed must open in the shape the engine produces; **it opens at a quarter of it.** Owner:
       the seed, with SCALE — and consolidating the duplicates and the dust is ~25% off every
       register walk, which is the largest single algorithmic item left.
214. **UNDER 300 ms — and the thing standing in the way was a defect, not the engine.**
     §7.213 concluded that with 70 ms of numerics and ~1,400 ms of orchestration and no hot spot
     above 13%, the only lever left with a multiplier was HOW MUCH OBJECT GRAPH there is. That was
     right. What it did not know is why pulling that lever had never worked.
     - **The roster size was setting regional GDP (rule 13).** The seed pads each region's public
       tier out to 200 names, and its own comment says why: "breadth of the roster a player can
       pick from, **not the region's economic scale**". It was the economic scale. Every padding
       clone ADDED its revenue and its jobs on top. **Measured at half roster: 5.2M jobs and 0.43T
       of output vanished**, while the SME pool the named tier is carved OUT of sat unchanged at
       5.88M — so the carve was one-directional, subtracting from the pool but never giving back.
     - **A thinned roster hands what it drops to the names that remain.** Sampled on a STRIDE, not
       truncated at the top, so the size distribution is sampled rather than beheaded; the keepers
       are lifted to carry the whole tier's revenue; headcount is left alone because
       `dealProductLinesAndHeadcount` re-derives it from revenue over productivity. **Conserve the
       revenue and the jobs follow.**
     - **MEASURED at seed — 2,496 companies down to 336 with the economy the same size:**
       employment 28.34 / 28.37 / 28.36 / 28.23M and output 2.117 / 2.107 / 2.103 / 2.100T at
       scale 1 / 0.5 / 0.25 / 0.12. **That is what makes the roster a RESOLUTION parameter and not
       an input** (rule 19), which it had been asserting it was in a comment for as long as it has
       existed.
     - **THE CYCLE: 1467 ms → 707 → 391 → 205** at those four scales, and **UNIVERSE_SCALE=1 is
       bit-exact with the commit before the knob.**
     - **The false floor.** The first curve flattened at ~830 ms and looked like an engine floor
       that no roster change could touch. It was a flat `Math.max(20, …)` per SEGMENT in the
       private tier — 16 industries × 20 = 320 firms a region however small the knob was set. **A
       floor can impersonate a law of nature; print the count before believing one.**
     - **Invariance, 12 weeks:** unemployment 18.1/13.0/11.6/12.3 at full against
       17.4/10.2/9.8/12.5 at half, where before conservation it read 28.1/28.4/30.7/29.9. It is
       NOT exact at quarter scale and below — and §7.211's divergent regime means some of that
       spread is chaos rather than resolution error, which cannot be separated until the price
       level settles. **Iterate below 1; validate at 1.**
     - **What this does NOT do:** it does not make the full-fidelity cycle faster. 1467 ms at scale
       1 still stands, and §7.213's account of it is unchanged.
215. **FULL FIDELITY: 1360 ms, and the list of things that are NOT the problem.** §7.214 met the
     wall-clock budget by making the roster a conserving resolution parameter, which is worth
     having and is NOT what was asked for: it runs a smaller world, not the same world faster.
     This record is the same-world attempt, and its value is the eliminations.
     - **RUN COMPILED JS.** The harness ran through `tsx`, which transpiles per module. Bundled
       once with esbuild and run as plain JS it is 10–15% faster and **bit-exact over 20 weeks**.
       `npm run verify` and `npm run profile` build to `node_modules/.cache` first.
     - **AND IT RESTORES LINE-LEVEL PROFILING.** §7.772 recorded that tsx flattens every function
       to line 1 so V8 cannot attribute inside a stage, and section timers were the workaround.
       Against the BUNDLE, `--cpu-prof` gives real line numbers. **That tool is available now.**
     - **NOT the problem, each measured:** Bun runs it 8% slower (1589 vs 1464 ms). V8
       dictionary-mode is not the flat profile's cause (9 of 2,496 companies; no entity, no
       region). The clearing engine's worker pool buys nothing on 4 cores (§7.213). And netting
       payments on the way in — which looked obvious against 170,000–200,000 instructions a week —
       is worth 11%: **162,705 rows carry 144,650 distinct (payer, payee, reason) triples**, and
       coalescing measured SLOWER than the key cost to find. The goods market genuinely has that
       many counterparty relationships in a week, one per lot.
     - **THE ARITHMETIC, so the next attempt starts from it.** 1360 ms: stage 08 ~430 (2,496
       companies × a body whose seven sections are all between 13 and 116 ms), stage 05 ~314
       (entirely the auctions), the five financial books + securities lending ~310, GC ~120, and a
       tail of thirty stages. The numerics inside all of it are ~70 ms. **Nothing here is 5×
       anything.** Getting the same world under 300 ms means the object graph stops being an
       object graph — §7.777's conclusion, reached for the third time and now from line-level data
       rather than section timers.
     - **The scoped version of that, if it is taken:** the holdings register alone — 120,000 rows,
       walked by twenty files — is ~300 ms of the 1360. It is the one data structure worth
       converting first, and it can be done behind the existing accessor.
216. **WHAT LINE-LEVEL PROFILING FOUND, once §7.215 made it possible.** §7.772 recorded that tsx
     flattens every function to line 1 so V8 cannot attribute inside a stage. Profiling the BUNDLE
     lifts that, and the first look found things four rounds of section timers had missed.
     - **The #1 and #5 self-time lines in the whole program were the same thing:** the accrual
       ledger being rebuilt `Object.entries → Map` on the way into every week and
       `Object.fromEntries` on the way out. **~105,000 keys, 5.25% of all CPU**, converting a
       container into another container and back. **Nothing serialises or hashes GameState**, so
       the object form was buying nothing — a data-shape decision that had never been checked
       against a reader.
     - **ETF flows was quadratic in the register:** every fund asked every entity for its holding
       of that fund by reducing over the entity's ENTIRE book — 27 × 75 × ~1,600 = **3.2M row
       visits a week to read a few thousand positions.**
     - **The register carries one row per POSITION now.** A fill appends rather than merging, so
       it fragments: 122,164 rows over 103,633 distinct `(holder, instrument)` pairs at week 15,
       and twenty-eight sweeps a week walk the duplicates. Merging is lossless. **It has to run at
       the week's CLOSE, not at the books' write-back** — the late stages append after the books,
       and folding earlier left 9,734 of the 18,531 standing.
     - **MEASURED: ~1400 ms against 1872 at the start of this work — 25%, full fidelity, macro
       prints unchanged.** With §7.214's conserving roster the same engine runs at 205 ms.
     - **The lesson worth keeping:** three rounds of "the profile is flat, there is nothing left"
       were wrong, and they were wrong because the instrument could not see inside a stage. **A
       flat profile is a statement about the profiler until the profiler can resolve lines.**
217. **WAVE 2, MILESTONES 1–3 — the design's decisions, applied and measured.** §7.216's design
     was written from the profile; this is what happened when it was built. **1418 → ~1200 ms per
     cycle at full fidelity, bit-exact**, and everything below is the design's own numbering.
     - **Decision 2, A PARTY IS AN `int32`.** `partyKey` built a fresh string per call and was
       called four times per payment — ~580,000 string builds a week for identities that never
       change. Interned per kind, so the kind is never concatenated into a lookup; the running net
       and the netting pass are ARRAYS indexed by that id with a touched-list for the reset.
       **1418 → 1333, and the run-to-run spread collapsed from ±50 ms to ±3 ms** — fewer
       allocations, steadier timing.
     - **Decision 3, THE REGISTER AS CSR.** Two flat `Int32Array`s — holder position, row position
       — grouped by instrument type by counting sort. A consumer that wants one type walks only
       that slice. **It caches across stages and holds POSITIONS, not references**, so a stage that
       re-maps the entity list does not disturb it; five weekly writers bump it beside their own
       write. Within a type it preserves register order, which is what keeps every consumer
       bit-exact.
     - **Decision 5, THE PAYMENTS AS COLUMNS.** Four parallel arrays, reasons interned. `pay`'s
       signature is unchanged so no call site moved. The apply pass rebuilds a `PartyRef` from the
       first ref seen for an id — sound because **the id IS the identity**. The old instruction
       array is gone from the context and from `GameState`, where it had become state nothing read.
     - **AND THE LEDGER ITSELF WAS THE WRONG SHAPE TWICE.** First it was a plain object rebuilt into
       a Map every week and back (§7.216). Then, still flat, it cost a composite string per matched
       row to write and the coupon pass walked ALL 105,000 entries string-slicing each to find the
       few actually due. Nested by instrument then holder: no string, and the payout visits only
       the instruments paying this week.
     - **TWO MORE QUADRATICS, both found by the heap profiler rather than the CPU one.**
       `formSupplyRelationships` re-derived "who makes this input" for every (customer × line ×
       requirement) by filtering the whole region with a `.some()` inside the filter — tens of
       millions of comparisons a week and **15% of everything the engine allocated**; it is one
       index now (1287 → 1221). And securities lending read the whole live borrow book once per
       loan, twice.
     - **A NEGATIVE RESULT, kept because it cost a day to learn:** the weekly register
       consolidation was A/B'd once the sweeps around it got cheaper — 1205 ms with it against 1209
       without. It pays for itself by a hair and stops the register fragmenting, so it stays, but
       it is nothing like the 25% the row-count suggested.
     - **WHAT IS LEFT, AND IT IS ONE THING.** `runCompanyFundamentalsStage` is 196 ms of the
       remainder, 2,496 companies × an 1,800-line body whose per-company floor is 78 µs — and that
       floor is **decision 1**, the one milestone not attempted here: the company table. Everything
       else in the profile is now under 8%. **Wave 2's remaining value is concentrated in a single
       conversion**, which is a better place to be than a flat profile, and it is the one that
       touches every file that reads a company.
218. **WAVE 2 PHASES 1–5: THE MACHINERY EXISTS, THE CONVERSION DOES NOT. Read this before
     celebrating the commit list.** Five phases landed, `tsc` and the build green, **bit-exact over
     20 weeks — and the cycle is unchanged at ~1,205 ms**, which is exactly what should have been
     expected and is the honest headline.
     - **What exists now:** the `Table` primitive (named typed-array columns over one
       `SharedArrayBuffer`, doubling growth, LIFO free list, deterministic layout); the `InternTable`
       (dense `int32` ids per kind, never reused); the per-week `Arena`; the `HoldingsTable`
       (~110,000 positions in five columns with CSR groupings by holder, by type and by instrument);
       the `CompanyTable` (2,496 rows × 27 numeric columns plus flags, with a `syncIn`/`syncOut`
       seam); the `TrancheTable` (~8,600 rows grouped by issuer); and the kernel/shard harness with
       the ordered-combine rule encoded in it.
     - **What does NOT exist: the readers and writers.** ONE consumer has been converted — the
       interest accrual, which reads the holdings columns. **Stage 08 does not read the company
       table. Nothing reads the tranche table. Nothing shards.** The tables are built and correct
       and, apart from that single reader, unused — which is why the timing did not move and why
       the bit-exactness result, while necessary, proves almost nothing yet.
     - **THE PHASE 3 FINDING THAT CHANGES THE PROJECTION'S SHAPE.** The per-line profile of stage
       08's body is FLAT — no line above 0.85% over ~1,800 lines — and V8 reads a field off a
       monomorphic object in about a nanosecond. **So converting those reads to column loads is not
       where a 10× comes from.** The company table's value is cache locality on bulk single-field
       sweeps, no allocation (retiring the 8.5–8.9% GC), and above all **a state a worker can take
       without cloning.** Phase 3 is the ENABLER for phase 4, not a speedup on its own, and §7.216's
       projection should be read that way: the return is collected when the body SHARDS.
     - **Which makes the remaining order clear, and it is not the order that was planned.** Wiring
       the company table into stage 08 while it still runs single-threaded buys close to nothing.
       **The next real step is the worker path** — and its blocker is not the tables, it is that
       stage 08's body still reads `updatedRegions`, `companyUpdates` and the payment journal as
       objects. Those three are the last object-shaped things standing between the engine and its
       other three cores.
     - **What was skipped, deliberately, on instruction: verification between steps.** The gate was
       built and run once at the end rather than at each phase. It passed. Had it not, five phases
       of state-layer work would have had to be bisected — the commits are separate precisely so
       that would have been possible.
219. **THE THREE CLAIMS UNDER THE REBUILD, TESTED.** §7.216–218 twice projected a speedup from a
     number whose cause had not been established. These are the measurements that should have come
     first, and one of them refutes the mechanism while confirming the conclusion.
     - **A. WHERE THE CLEARING TIME GOES.** The clearing family is **563 ms/week** inclusive
       (05-unit-bidding 278, corporate bonds 70, equities 59, loans 56, short debt 42, securities
       lending 48, sovereigns 10). The actual clearing — `clearFinancialAsset` and `clearBook` and
       everything beneath them — is **~120 ms**. **So ~440 ms is the FUNNEL, not the auction**, and
       it is the largest single block in the engine. (Stage 08 is 327 ms INCLUSIVE; the 196 ms
       quoted in §7.218 was self time, and that understatement is on me.)
     - **B. THE SERIAL FRACTION IS 12%.** Classified over the whole stage profile: 1,050 ms is work
       over independent entities (companies, books, sub-unit markets, funds, estates, register
       rows) and 147 ms is whole-world reduction (settlement, fiscal, the central bank, the region
       scalars). **88% shardable** — better than the 85% the projection assumed. Amdahl gives 2.92×
       at four cores, 4.31× at eight.
     - **C. THE ADAPTERS ARE NOT ARITHMETIC — 2.8 ms OF THEM IS.** Every named pricing function in
       the books — reservation spread, expected loss, capital charge, the distressed reservation —
       totals **2.8 ms a week**. The other ~437 ms is gathering inputs off the object graph,
       building a plan object per (entity × issuer) pair and allocating an array per book.
     - **WHICH KILLS THE MECHANISM I PROPOSED AND STRENGTHENS THE CASE.** "A participant's schedule
       is STATE" is wrong: `expectedLossBps` and `liveFloatUSD` move every week, so most pairs must
       be recomputed and caching them saves nothing. **The correct statement is that the schedule
       should be computed INTO COLUMNS rather than into objects** — same arithmetic, same weekly
       recomputation, written into preallocated `Float64Array`s the kernel already reads. 2.8 ms of
       maths does not need 437 ms of packaging.
     - **THE PROJECTION, REBUILT ON MEASURED PARTS:** funnel 440 → ~20, kernel 120 unchanged
       (it IS the simulation), stage 08 327 → ~60, everything else ~515 → ~100 with the GC gone.
       **Single-threaded ~300 ms; at 88% parallel on four cores ~100 ms.** That is AT the line, not
       under it — eight cores or a sharded kernel puts it clear.
     - **The rule this record exists to enforce:** three projections in this file were made from a
       real number with an unestablished cause, and all three were wrong (§7.213's "no hot spot
       left", §7.216's "columnar gives 10×", §7.218's own correction). **Establish the cause, then
       project.** These three tests cost under an hour.
220. **THE SCOPING FAILED, AND THAT IS THE ANSWER. There is no dominant block.** §7.219 concluded
     the clearing "funnel" was ~440 ms and scoped a rewrite around collapsing it. Instrumenting the
     funnel directly killed that scope in two measurements.
     - **07b's adapter — every participant and every demand schedule it builds — is 9 ms.** The
       engine beneath it is 27 ms. The layer §7.219 proposed deleting is a seventh of the book it
       sits in. "Objects built only to be packed into typed arrays and thrown away" was true and
       was worth nine milliseconds.
     - **05-unit-bidding, the largest stage at 278 ms, splits as** `settleContracts` ~45,
       `buildRegionDemandPlans` ~26, `clearBook` ~28 — **~100 ms of 278.** The rest is fill
       application, the per-lot payment loop, inventory writes, freight and the index build. No
       single one of them is large.
     - **SO THE COST IS GENUINELY DISTRIBUTED, established four independent ways:** a flat CPU
       profile (§7.213), a flat per-line profile inside the biggest body (§7.218), a 9 ms adapter,
       and a largest-stage split where the top item is 16% of its own stage. **This engine is ~40
       stages each doing a moderate amount of real work over a large object graph.** Every attempt
       in §7.212–219 to find the one block has failed, and the failures agree.
     - **WHICH SETTLES THE 100 ms QUESTION, ARITHMETICALLY.** 88% of the week is shardable
       (§7.219), giving 2.92× on four cores; retiring allocation and the GC gives perhaps 1.3×.
       **That is ~3.8× — about 370 ms — and there is no measured 4.8× of single-threaded waste left
       to find on top of it.** Four independent probes say the remaining work is the model
       computing itself. **Under 100 ms on four cores, without changing the simulation, is not
       reachable.** At eight cores the same rewrite lands near 250 ms; at sixteen, near 180.
     - **What IS reachable, and it is worth having:** the full data-oriented rewrite at ~370 ms on
       this hardware — a 3.8× — with the simulation unchanged and every step bit-exact. The three
       decisions that get it are the measured ones: shard the 88%, allocate nothing, and stop
       walking the object graph. Not the ones invented to explain a ratio.
     - **The discipline this whole run of records exists to install:** §7.213, §7.216, §7.218 and
       §7.219 each projected a large win from a real number whose CAUSE was assumed. All four were
       wrong, and each cost more to discover than the measurement that would have prevented it.
       **A projection without an established cause is not an estimate, it is a hope with a number
       attached.**
221. **AUDIT OF §7.220: THE MEASUREMENTS HOLD, THE CONCLUSION DOES NOT.** §7.220 was written to
     forbid projecting from a number whose cause was assumed, and then did it three more times in
     its own final paragraph. Sorted by what each claim actually rests on:
     - **MEASURED, and they stand:** 07b's adapter at 9 ms against 27 ms of engine (three runs:
       11.7 / 8.5 / 9.0); 05's three named blocks at ~100 ms of its 278 (three runs: 86 / 94 / 102);
       stage 08 at 327 ms inclusive; the clearing family at 563 ms and its kernel at ~120 ms; the
       flat CPU profile and the flat per-line profile; every bit-exactness result; 1,872 → 1,205 ms.
     - **NOT MEASURED, and §7.220 states them as if they were.** (a) **"88% shardable" is a hand
       classification of stage NAMES into two buckets, not a measurement**, and it assumes a
       within-stage independence never tested — 05's sub-unit markets and stage 08 both write
       shared `ctx`, which is direct counter-evidence that was in front of me and not weighed. The
       true serial fraction is unknown and can only be LARGER. (b) "allocation removal gives ~1.3×"
       is extrapolated from GC being ~8% of the profile; removing allocation is not the same act as
       removing GC time. (c) **"~370 ms" is (a) × (b)** and inherits both, as do the eight- and
       sixteen-core figures, which are pure Amdahl on (a). (d) "no measured 4.8× of single-threaded
       waste left" is absence of evidence — five probes failing to find a block is real, but 10–60 ms
       distributed items (ETF quadratic, supply-graph quadratic, the `toFixed` sweep) kept appearing
       to the last hour, each invisible to the probe before it. (e) "2.8 ms of pricing arithmetic"
       is a LOWER BOUND: it name-matched profile frames, so inlined and anonymously-called pricing
       code is not in it. (f) §7.219's rebuilt projection (funnel 440→20, stage 08 327→60, the rest
       515→100) is three more unestablished-cause projections.
     - **ALSO:** 05's per-item figures in §7.220 (~45 / ~26 / ~28) are a mid-value across noisy
       runs — settle ranged 35–54, clear 22–37. Only the ~100-of-278 aggregate is stable. Quote the
       aggregate, not the items.
     - **WHAT IS ACTUALLY ESTABLISHED:** five independent attempts to find one dominant block have
       failed and agree, and no single item found exceeds 16% of its own stage. **"Under 100 ms on
       four cores is not reachable" is NOT established** — the parallel fraction, the one number the
       whole arithmetic rests on, has never been measured.
     - **THE EXPERIMENT THAT SETTLES IT, AND IT IS NOT A REWRITE:** shard ONE real stage — 05 or 08
       — and find out whether the cross-writes permit it. That measures the serial fraction
       directly. If 88% survives contact the arithmetic stands; if it comes back at 60% the ceiling
       is ~600 ms and the data-oriented rewrite is not worth its cost. **Do this before scoping
       anything on the parallel fraction again.**
     - **The rule, sharpened:** it is not enough to demand an established cause for a projection.
       **A classification is not a measurement.** §7.220's "88%" reads like a profile result and is
       an opinion about stage names.
