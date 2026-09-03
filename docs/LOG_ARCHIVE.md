# THE LOG, IN FULL — the narrative record through 2026-09-03

`docs/MASTER_PLAN.md` §9 is the ledger: one line per finished step. This file is the long-form
record those lines were compressed from — kept because a few entries carry reasoning the ledger
cannot, and deleted rather than rewritten when an entry stops being worth reading.

Numbers are the original record's and never change. Line numbers in it are long stale (§1.16): a
lead, not a fact. Nothing here governs — the plan does.

A finished step leaves §3 and lands here: what changed, why, and the measured numbers.

**13-SOV ROW 3 — SIZED: 1.85T OF GOVERNMENT PAPER, HELD IN FOUR STORES, NONE NAMING A BOND.**

A corporate bond's holder is a register row naming a TRANCHE, and O6/O7/O8 hold that to account.
A government bond's holder is one of **four** separate stores, each keyed by a TENOR BUCKET:
`bankBalanceSheet.sovereignBondHoldingsByBond`, `centralBankSheet.sovereignHoldingsByBond`,
`bankingSector.sovBondDealerInventory`, and the institutional register's rows on a bucket id. A
bucket has no issue date, no coupon of its own and no maturity, so **the question "who holds this
government bond" has no answer.**

**The clearest evidence it is a hole and not a style is in the audit itself.** `ownership.ts:o3` —
the check that every register row names a live instrument — opens with
`if (h.instrumentType === 'GOV_BOND') return;`. The integrity check carves out exactly the asset
class that has no instrument to be checked against.

`O11` measures it: **1852.61B across 4 stores — banks 295.04B, central banks 676.30B, desks
11.84B, register 869.43B over 933 rows, of which 0 name a tranche.** Violations 70 in 24 families
→ 75 in 25.

It goes green when a sovereign holding is a row naming a tranche in the same store as every other
holding. That is row 3, and it is what makes the sovereign BOTTOM-UP: row 4 made the direction
right — price is the primitive, yield derived — but the object being priced is still an aggregate
of four buckets per region whose coupon is a face-weighted average and whose maturity is a label.

**Also fixed, my own rule 4 breach from row 4:** `SOVEREIGN_COUPON_PERIOD_WEEKS = 26` had been
declared in `prices.ts` and again in `07c`, where `domain/pricing` already exported
`COUPON_PERIOD_WEEKS = 26` for that fact — the third and fourth representations of one number.
Both deleted. It matters beyond tidiness: P8 measures the sovereign against the same schedule 07c
prices it on, and two constants that agree today can stop agreeing.

**And O11 itself was written twice**: the first version compared `h.instrumentType !== 'GOV_BOND'`
and the hygiene gate refused it — the instrument-literal ratchet was at 54 and that made 55. Asking
`holdingClassOf` for the FACT is what the rule wants, and it is also more correct, because it
catches `SOV_BOND` too — the model's other name for the same instrument, and part of what row 3
has to collapse.

**13-SOV ROW 4 — THE SOVEREIGN CLEARS A PRICE. BOTH BOOKS.**

Bonds (07c) and bills (07f) both cleared a YIELD, and `financial-clearing-engine` values a
YIELD_LIKE fill at `unitValueUSD = 1` — so a government bond changed hands at FACE whatever its
coupon and whatever the curve said. Rule 1 says the price is the primitive; `bond.md` N7.b says it
in the instrument's terms. **Bills are not an exception and were nearly left as one:** a bill is a
bond that pays no coupon and returns its discount (N5.c), so "clears a yield, settles at par" is
the same defect there, and 07f already half-knew it — it computed a discount price from the
cleared yield and REBATED the difference, machinery that exists only because the price was not the
thing being cleared.

Nothing about anyone's REASON changed. A sovereign buyer's reservation genuinely is a yield — its
alternative is the policy rate — so it still computes one and then states it as the price that
yield implies on the bucket's own cash flows. What changed is what the auction solves for, and
therefore what a fill is worth.

**Each instrument keeps its own convention** (rule 8). A bond discounts its coupon schedule at an
annual effective yield (`pricing:priceFromYield`); a bill is quoted simple, `1/(1+y·t)`
(`government:discountBillProceedsUSD`, and its new exact inverse `billYieldFromPrice`). They differ
by about 2bp of price on a 13-week bill, so using one for the other would have re-priced every bill
by changing its day-count rather than by clearing it. A test pins both and asserts they are
genuinely different numbers, so neither can quietly stand in for the other.

Also kind-aware now: `centralBankParticipant`'s "no reservation". Its demand is a quantity, not a
view — but WHICH SIGN means "always" depends on the book, and getting it backwards does not fail
loudly, it just silently removes the central bank's policy quantity from the auction.

**MEASURED: 70 violations in 24 families, unchanged.** The curve is fitted through what the market
paid, and it moves: USA 3M 3.91–3.93%, 2Y 4.54%, 10Y 4.44%, 30Y 5.09%.

**AND IT FOUND A PINNED RATE, WHICH HAD TO BE FIXED FIRST** (its own commit, §9 above). With the
bill book converted, the 13-week print sat at exactly 0.99030000 every week while the 26- and
52-week prints moved. Cause: `solveClearingStat`'s result went through `toFixed(4)`, an ABSOLUTE
1e-4 grid — 1e-4 of a basis point on a bps-quoted book, and a whole basis point of PRICE on a
price-quoted one, which on a 13-week bill is four basis points of yield, more than the weekly move.
Ten significant figures instead. It is a world relabel, and it also removed `M8`'s FX finding: the
FX book is PRICE_LIKE with rates near 1, so the same grid had been quantising every exchange rate
to a pip.

**What P8 now measures has changed with it**, and its message says so: the auction prices the
sovereign, and the REGISTER still carries it at face — 54.63B on 1886.42B. That is step 13's item
4, the stored value, and it is the same defect the equity row has.

**13-SOV ROW 4 — SIZED BEFORE IT IS BUILT: THE SOVEREIGN BOOK IS 57.34B AWAY FROM PAR.**

The sovereign is the one book in this model that clears a YIELD rather than a price
(`assets/index.ts` declares it `YIELD_LIKE`; `financial-clearing-engine.ts:956` then values every
sovereign fill at `unitValueUSD = 1`). So a government bond changes hands at FACE whatever its
coupon and whatever the curve says, and every holder carries it at face for its whole life. That
is rule 3 failing outright on 1.88T of paper, and `../instruments/bond.md` N7.b in the
instrument's own words.

**`P8` measures it, and it is P5's twin one asset class over.** It reads the ladder's face against
what those same rungs are worth discounted at the curve THE AUCTION ITSELF JUST CLEARED — not a
second opinion about the price, the book's own output. Measured on the reference run: **76
sovereign rungs on 1886.42B of face carried at face against 1829.07B implied, a 57.34B gap**, worst
68.49B, by region USA −3.30% · JPN −2.76% · UK −3.03% · EUR −2.59%. It cannot go green by tuning;
it goes green when the sovereign clears a price.

Violations 67 in 24 families → 72 in 25: P8 fires in all five weeks including week 0.

**The tools for the swap are in and tested** (`domain/pricing/bond.ts`): `priceFromYield` and
`yieldFromPrice`, deliberately distinct from `priceFromSpreadBps` because a yield is ONE rate over
the whole schedule where a spread is applied over a curve with every flow at its own tenor. Three
tests, and one caught a wrong premise of mine: coupon = yield does NOT give par at every coupon
frequency, because the discounting is at an annual EFFECTIVE yield, so a 4% coupon paid twice a
year is worth more than one paid once (30y semi-annual 1.006849, quarterly 1.010290). The test now
pins what is true — annual coupons exactly par to 1e-12, and paying sooner is worth more.

**What is left of row 4**, and it is the change step 13 says must not be byte-identical: the
instrument becomes `PRICE_LIKE`, the two reservation sites (institutional and bank) state their
reservation YIELD as a reservation PRICE, `fullSizeStatRange` converts from a yield range to the
price range it implies, `central-bank-demand`'s "no reservation" becomes kind-aware (in price
space always-in-the-money is a HIGH reservation, not a low one), and the cleared price is turned
back into the yield the curve is fitted through. The clearing engine itself needs nothing: it
already orients generically (`u = stat` for YIELD_LIKE, `u = -stat` for PRICE_LIKE) and the dealer
desks already read `isYieldLike` and adapt.

**13-SOV ROWS 1 AND 2 — THE SOVEREIGN JOINS THE ONE STORE.** Five of the five parallel structures
were: its own type, its own store, a holdings bucket with no instrument in it, a YIELD clearing,
and its own curve. The first two are closed but for a deletion.

**Row 1, the type.** `GovDebtTranche` was a standalone interface whose every field was also a
`DebtTranche` field — a strict subset, declared separately, carrying no characteristic a corporate
bond lacks and only lacking ones. It is now `DebtTranche & { couponRate; tenorAtIssuanceYears }`.
The two fields the three construction sites gained are answers the bond contract asks for, not
filler: FIXED because a sovereign's coupon is locked at issue (`bond.md` N5.a), SENIOR because a
sovereign's claims rank equally and there is no stack (N13.a — stated even though the answer is
"all equal"). Behaviour-neutral, as a type change should be.

**Row 2, the store.** Staged the way a store migration has to be, and the staging earned its keep
twice:
- the ledger could not name a GOVERNMENT issuer at all — `issuerParty` returned `{kind:'COMPANY'}`
  unconditionally — which is one of the reasons the sovereign got its own store in the first place;
- the seed opens the sovereign ladder into the store BY WIRE, and all four regions mirror exactly:
  USA 939.81B, UK 247.62B, JPN 304.45B, EUR 356.72B, 1.85T of government paper;
- `reconcileLadderByWire` diffs the store against the array and wires the difference — face that
  appeared is ISSUED, face that vanished is RETIRED. It does not overwrite rows, and that is
  §9.37-SEED's lesson restated: `syncLadderRows` would make the store agree instantly and leave
  the paper standing with no wire behind it;
- all three writers write through (11-fiscal's weekly rebuild, and 07c's and 07f's withdrawals),
  so store and array agree at every point in the week and a reader may take either;
- every reader has moved: the audit's two, 07c's ladder and cross-region stock, 07f's bills, bill
  stock and HQLA pool, 11-fiscal's interest bill and accrual, and the four coupon-by-bucket reads.

**Sovereign paper had never been under `wires reproduce the ladders` (W3) or the store's
`Σ held = issued`.** Joining them, it passes both on the first run.

**And it found the seed rounding a span twice.** Moving the readers needs the bucket key, and the
store has no tenor column — but it has both dates, so the tenor should be derivable. Tested rather
than assumed: 20 of 260 rungs disagreed, all of them the seeded 13-week bills, because
`originationWeek` was `-round(w/2)` and `maturityWeek` `+round(w/2)` — a 14-week span for an
instrument that calls itself 13 weeks. Two representations of one fact, disagreeing (rule 4).
Rounded once, they agree on all 260 rungs and the maturity week does not move, which is what lets
the stored tenor be DELETED rather than carried forward and reconciled.

**MEASURED at every step: 67 violations in 24 families, byte-identical, check for check.** The
only findings the migration itself produced were two `payment reason matches no category rule` for
the new wire reasons — registered, which is the repo's own requirement that every wire says what
kind of flow it is.

**37-ZEROSUM — THE THREE INVARIANTS, AND ALL THREE FIRED ON THE FIRST RUN.** Each was the cheapest
possible detector for something the atlas had found by reading. Each now finds it without a person
reading anything, which was the whole argument for putting them before the rest of the list.

**MEASURED, 4 weeks, shocks off: 54 violations in 20 families → 67 in 24.** Every one of the 13 is
a new check reporting a defect that was already there.

**`O10` — a receivable is somebody's payable.** One line, and the largest of the three.
*800 firms file 41.20B of receivables against 27.47B of payables — a 13.73B claim on nobody.* The
cause is one line of the seed: `companyGenerator.ts:232` sets `accountsReceivable = workingCapital
× 0.6` and `:233` `accountsPayable = workingCapital × 0.4` — **both fractions of the SAME firm's
own working capital, neither naming a counterparty.** They cannot net because they were never two
sides of anything. `trade-credit.md` A1/C4, and it confirms 37-TRADECREDIT from the other
direction.

**`O9` — every derivative carries a mark.** *939 live contracts on 357.83B of notional carry no
mark at all.* `markToMarketUSDToA` returns `null` for CDS and for IRS, so their value moves and
never becomes cash: no variation margin passes and no counterparty exposure is measured
(`../instruments/derivative.md` D8, `the-derivative-layer.md` D2). The zero-sum half — the marks
summed **across parties** rather than across contracts, so that a contract booked to one side only
cannot net — **passes**, and that is worth recording: where a mark exists it is genuinely
two-sided. It is the classes with no mark that are the hole.

**`M8` — the FX revaluation is the rate move on the world's open position.** *Revaluation booked
0.00B against −0.06B implied by every account row and the week's rate move.* The stage walks BANKS
and CENTRAL BANKS; this recomputes the same number from every account row that exists, so the two
can only agree if every foreign position was revalued exactly once. They do not: **a non-bank's
foreign balance is revalued by nobody.** 60M is small and the mechanism is not — it is
`currency-and-fx.md` D2.b exactly, an unrevalued position being money created or destroyed
silently, and this is the only check in the tree that can see it. Tolerance is absolute float dust
on a sum of that many rows, never a fraction of it (rule 7).

`fx-revaluation` now records what it booked (`state.lastFxRevaluation`, with the rates it moved
between) so the audit can recompute independently rather than re-deriving the stage's own
arithmetic and passing tautologically (the-audit A1.a).

Gates: tsc clean, eslint 341 (ratchet), 135 tests, hygiene, build ok.

**37-SEED (part 3) — THE ROLLOVER CHANNEL EXISTS, AND TURNING IT ON FOUND IMMORTAL DEBT.**

Every corporate rung opened at `originationWeek: 0` with maturities at 260/520/780 weeks, so **no
corporate bond matured inside a 60-week run** — the rollover channel, which is the only risk a
bond has that a perpetual does not, was off for the model's whole measurable life. The sovereign
side already seeds mid-life and was the template; this goes one better, because putting every rung
at exactly half-life (what the sovereign does) just moves the wall rather than removing it
(the-seed C3.a: a profile must be SPREAD, or every roll arrives at once).

Each rung's age is now a hash of its own tranche id, so remaining life lands uniformly in
[2, tenor]. **A hash, not `random()`, for a measurement reason:** `generateDebtTranches` runs
inside the seed's stream, so a draw would shift every subsequent seeded number in the world and
the maturity change could not be told apart from the shift. It is not a real-world ratio (rule 2);
it is the no-information answer, since nothing in this model says when a given firm issued.

**MEASURED: 3,713 seeded tranches, maturities now min 2 / median 183 / max 775. 189 mature inside
16 weeks and 625 inside 60, against ZERO before.** Violations 53 → 54 in 4 weeks, which for a
channel switching on from nothing is the result worth reporting: the maturity, paydown and
refinancing machinery was already right.

**WHAT IT FOUND — A MATURITY WAS A SINGLE-FRAME EVENT.** With ladders aged, 47 seeded rungs came
due by week 4. The 29 maturing in weeks 2–4 all retired. **All 18 maturing at week 1 were still on
the ladder at week 4, and every week after.**

Cause, established by probe rather than inference: `stage08-back.ts` retired on
`TS.maturityWeek[r] === nextWeek`, an exact equality. The seed sets `currentWeek = 1`, so the
first weekly step's `nextWeek` is 2 and anything due at week 1 was already in the past the first
time the engine looked — and an equality test never looks again. Such a rung is **immortal debt**:
it accrues and pays interest forever and its principal is never repaid.

Fixed at the cause, not at the seed (rule 12). Retirement is now `<= nextWeek` — due OR overdue —
which is also what a ladder MEANS: a claim does not stop being due because the date passed. An
issuer that misses the date has defaulted, which is a state this model has (§3.34) and reaches
through the cash test, never by the claim quietly ceasing to be measured. The seed's floor of two
weeks' remaining life is kept as well, so the opening world does not contain paper that was
already due before the engine's first look. After: all 47 retire, none stuck.

Gates: tsc clean, eslint 341 (ratchet), 135 tests, hygiene, build ok.

**37-SEED (parts 1 and 2) — THE SEED IS AUDITED, AND IT FINISHES ITSELF.** The audit ran only
inside the harness week loop, so no invariant family had ever seen the state the world STARTS in.
Every week-1 finding was ambiguous between a bad opening world and a bad mechanism, and that
ambiguity costs a search that cannot succeed: there is no stage to find a seed defect in.

**MEASURED, 4 weeks, shocks off: 50 violations in 19 families → 53 in 19.** The three new ones are
all at week 0 and weeks 1–4 are unchanged.

**Part 1 — `auditSeed`, and it is not `auditWeek(state, 0)`.** Two differences, both found by
running it the naive way first and reading what broke:
- **It asks only what a stock can answer.** Week 0 has no elapsed week, so "what moved" is a
  question about a flow that has not happened. The first run produced five findings of exactly
  that kind — `W1` "no wires were recorded this week", and `F2` "revenue = tax remitted" against a
  zero that means *not yet*. Both now guard on `week === 0` in the audit itself, because "the
  opening state has no elapsed week" is a fact about the model, not about the harness.
- **It is week 1's baseline, and that is a stronger claim than what it replaced.** `lastSnapshot`
  opened as the EMPTY world so that week 1 was asked to account for the seed's wires and its own
  together. A failure there could be either, and the audit could not say which. Now the seed is
  asked of itself against nothing, and week 1 is asked of itself against the seed.

**Part 2 — the seed opens its own mirrors, and the naive fix was wrong in an instructive way.**
The week-0 audit's first finding was `O3`: **36,996 register rows worth 903.14B naming instruments
that do not exist.** Cause established rather than guessed — `ensureLaddersSynced` runs at
`core.ts:154`, inside the weekly step, so the columnar tranche store was empty until week 1 built
it. Probed directly: calling it on a fresh seed took O3 from 36,996 rows to clean.

**And that fix was wrong.** `core.ts:152` does not call `ensureLaddersSynced`; it calls
`seedLadder`, which opens the ladder **by wire**, and it is guarded on `synced`. Syncing at the
seed marks every firm synced, turns `seedLadder` into a no-op, and leaves the ladders standing
with no wires behind them — measured, `W3` "wires reproduce the ladders" then failed at week 1 for
the full 260.74B of USA CORP_BOND. **The mirror was never the point; the wire is the point.** The
catch-up sits inside the weekly step for a stated reason — a wire needs a live journal, and none
is live during the seed.

So the seed opens a journal of its own, numbered week 0, and does the opening itself
(`initialization.ts:openSeededMirrors`): `seedLadder` for every firm, `seedBook` for every entity,
then `summarizeWires` into `state.lastWires`, so week 0's wires are a real journal the world
carries. `core.ts`'s catch-up is untouched — guarded on `synced`, it is now a no-op for anything
the seed opened and still catches every firm and fund BORN later, which is its other half.

**Fixing O3 unmasked two more, which is the argument for the whole method:** with the mirrors
empty, `O6` had been comparing a zero against a zero and passing, and `P5`'s register walk had
nothing to walk. Complete, they read: `O6` clean; `P5` — the seed opens 903.14B of credit marked
at FACE against 920.56B implied by its own seeded spreads, a −17.42B gap, which is step 13 visible
at week 0; `O7` — 409 tranches claimed beyond their face by $439.28 in total, which is real and
not dust (see §3.37-SEED's corrected note); `F1` — 685 firms filing a cash line that is not their
balance, −78.80B.

Gates: tsc clean, eslint 341 (ratchet), 135 tests, hygiene (atlas 910 citations), build ok.

**37 — THE SYSTEM ATLAS, MAPPED. 45 OF 45, AND 114 NEW FINDINGS.** The other two thirds of the
method (§9, THE SYSTEM ATLAS — THE REQUIRED SIDE): every required tree and both instrument
contracts walked onto the code, one `file.ts:symbol` citation per node, then the diff. Mapped by
eight parallel agents split by code area, each working from one written spec, with the parent
committing — the split was by CODE AREA rather than by tree count so that one agent's reading of a
subsystem was reused across all of its trees.

**The measured result: ~1,400 nodes marked, 910 machine-checked citations, 331 findings.** Of those,
217 were already steps here or are step 38 measurements — which is itself the useful number, because
it says the plan was not badly wrong about what it knew. **114 were new**, and they are §3 PART VII's
`37-*` steps, consolidated: a finding is not a step, and twenty trees reporting one cause is one
step. `docs/systems/UNMAPPED` fell from 321 lines to 109.

**What the method actually bought, stated so the next person can judge it.** Three kinds of finding
came out that a sweep cannot produce, and they are worth separating:

1. **AN ABSENCE WITH NO LINE NUMBER.** `currentAccountPctGdp` has no writer — seeded 0, rendered on
   two screens, permanently 0.0%; there is no balance of payments and no financial account at all.
   `Commodity.inventoryLevelPct` is a percentage on a random walk that nothing reads, so there is no
   commodity stock — not a bad one, none. No dwelling exists as an object; the wire ledger declares
   an asset kind `'HOUSE'` and no wire of that kind is ever written. There is no M&A market, only a
   quarterly `random() < 0.20` at a constant 15% premium. **No sweep reports these, because every
   line involved is correct.**
2. **A FORBID VIOLATED IN PLAIN SIGHT.** The treasury has a central-bank overdraft
   (`waysAndMeansOf`) and it is the funding mechanism — the one node the user stated in their own
   words. A bank loan cannot default, it erodes (`principal × PD × LGD / 52`, with
   `status = 'DEFAULTED'` declared and assigned nowhere). An unmet margin call is refinanced, not
   liquidated, at three independent points. The CDS default probability is an INPUT to the spread.
   For year one every beta in the model is a covariance against a random walk.
3. **A FORBID VERIFIED AND HOLDING**, which is worth as much and is the half that gets forgotten:
   no buyer of last resort in any auction (`unsoldStaysWithHolder` on all five books, desks
   capacity-bounded, the central bank's order a policy quantity struck outside the auction); no
   netting across counterparties; no short without a borrow, enforced twice; unemployment a read of
   summed real headcounts; the named-firm default a state test with no hazard rate anywhere. **These
   are now written down as things a future change must not quietly break**, which they were not
   before.

**The ordering decision paid for itself, and here is the evidence.** The required side was written
and committed before any mapping, so an uncited node is a finding rather than an unwritten tree.
Two nodes prove it worked: `the-seed` A2 says the seed must pass the audit at week zero — `auditWeek`
runs only inside the harness week loop, so **no invariant family has ever seen the seed's own
state**, and every week-1 violation this project has chased was unattributable between seed and
mechanism. `the-register` D4 says a register must answer what a position cost — there is no cost
basis anywhere in `src`. Neither is a defect on any line; both are answers to a question nobody had
written down.

**Three corrections the mapping made to this plan's own text**, recorded because a plan that cannot
be corrected by measurement is not a plan:
· 20-LLR says the central-bank facility has "no penalty rate" — it has one
  (`CENTRAL_BANK_LOAN_PENALTY_BPS = 100` over SRF). The three it genuinely lacks are collateral,
  eligibility and a cap.
· §9's 13c-FX-2 entry says `ctx.bilateralTradeWeeklyUSD` was deleted. It was removed from
  `fx-clearing` only; it still accrues per-fill at `05-unit-bidding:1786` and is what
  `06-fx-and-trade` publishes. F3 still holds (it is a report, not an input).
· Steps 33 and 13-SOV are both WORSE than recorded: `SUBORDINATED` is never written at any of the
  twelve creation sites, so `P1`'s subordinated arm has never fired in the model's life; and the
  sovereign has FOUR holder registers, not one bucket, with `GOV_BOND` and `SOV_BOND` as two
  `HoldingType` members for one thing.
Two corrections went the other way and SOFTENED a finding, which matters as much: corporate credit
D7 is diverging rather than absent (the accrual ledger does pay sold-out holders, so a coupon is not
a windfall — what is missing is the buyer-to-seller leg at trade, which is 13b), and G4 is diverging
(the estate does sell to real named peers, at a formula discount rather than at a price).

**What keeps it alive.** `scripts/check-atlas.sh` runs inside `check-hygiene.sh` on every commit:
910 citations must resolve, and every stage and source file must be in a tree or admitted in
`UNMAPPED`. It cannot tell you a node has become WRONG — that part is on the reader, and `CLAUDE.md`
now says so. When a `37-*` step lands, its tree's nodes are re-marked in the same commit; that is
the discipline the whole instrument depends on, and it is the one the three dead documents in this
repo's history failed.

**THE SYSTEM ATLAS — THE REQUIRED SIDE, 45 OF 45.** Authorised by the user 2026-09-03 (*"Do the
pilot. I like the idea of forcing it to be updated"* → *"Proceed with the other systems"* → *"move
instrument contracts to their own directory, and finish the whole set of trees"*), so it is no
longer PARKED; what remains of it is §3 step 37, the mapping.

**Why it exists, in the user's words:** *"I've asked to do multiple full sweeps of the code and
never once it was reported the credit didn't have a price or FX didn't exist."* The reason is
structural, not effort. **A sweep reads code and asks whether it is correct, and an absence has no
line number to be read at.** Every file in this repo does something plausible and is heavily
commented; nothing in the credit stage says "and there is no price" — it clears a discount margin,
coherently, and the missing price is invisible unless you arrive already expecting one. FX was
found the same way: not by reading code, but by the user asking why everything was called USD.
**A sweep finds defects; only a reference model finds absences.**

**The one decision that decides whether it works, and it is an ordering decision.** A tree derived
FROM the code reproduces the code's blind spots exactly, looks complete, and finds nothing: a
credit tree built by reading `07d-leveraged-loan-clearing.ts` would have a "clear the DM" node and
no "price" node, because the file has none. So every required tree is written from the DOMAIN with
the code shut and **committed before any mapping** — the git history is the proof — and the empty
nodes are the finding.

**What is in the repo now.** `docs/systems/` — a README carrying the method, the rules and the
45-row status table, and **45 required trees**, all depth 3. `docs/instruments/` — the instrument
CONTRACTS, which are not systems: `bond.md` (fourteen characteristics, cited by both credit trees
and short-term debt) and `derivative.md` (twelve, cited by CDS, IRS, FX forwards/XCS and commodity
futures). A tree whose subject is an instrument cites a contract and states only where its type
answers a node differently — which is what keeps "this type answers N5 differently" distinct from
"nobody ever answered N5", the whole point of the exercise.

**The node-type rule, and it came from the user** (*"not imposed, a consequence (just apply this
comment everywhere)"*). **NOTHING IN A TREE IS IMPOSED. A node states a REASON, never an
OUTCOME.** "Surplus banks lend and deficit banks borrow" is not a requirement, it is what happens;
the requirement is that each bank posts a schedule out of its own position, cost and constraints,
and who ends up on which side is the RESULT. A tree written in outcomes reads as complete and then
licenses code that assigns the outcome directly — rule 3's defect wearing the atlas's clothes. So
every node is marked as one of three, and a node that is none of them does not belong:
- **REASON** — "it has a cost of funds and a position it wants": checkable, and cannot be
  short-circuited by writing the answer down.
- **VERIFY** — "worse credit trades wider": a thing to MEASURE, never to enforce. A verify node
  that fails is a finding about the mechanism, not a licence to clamp the number.
- **FORBID** — "there is no central-bank overdraft for the treasury": a requirement that something
  be ABSENT. **These are the nodes a code-derived tree can never contain, because the code cannot
  show you what it should not have.** They are where this method earns its keep, and the ones this
  week's work produced include: no buyer of last resort by construction and no mechanism adding
  demand to make itself clear (the clearing engine); no conversion at the ledger boundary and no
  numéraire as the place value lives (currency — both of them defects actually found and fixed in
  §13c-FX, written down afterwards as requirements); no exogenous default event; no fixed recovery
  rate; no rating derived from the price; no representative SME and no representative household;
  no instantaneous costless transport; no sale that settles instantly by construction; no fund
  that cannot fail.

**What keeps it from rotting** — the part most likely to fail, and this repo has three dead
documents proving it (a `CLAUDE.md` describing sections that no longer existed, an
`ARCHITECTURE.md` referenced from code and never written, 699 markers pointing at a deleted
section). The code side of every node is a MACHINE-VERIFIED citation. `scripts/check-atlas.sh`
(the one new file in `scripts/`, by the user's explicit grant, recorded in the hygiene allowlist)
runs inside `check-hygiene.sh` and so gates every commit. It does two checks: **RESOLUTION** —
every `path:symbol` in every tree resolves, in `docs/systems/*.md` and `docs/instruments/*.md`
alike; and **COVERAGE** — every stage `core.ts` runs and every file under `src` appears in a tree
or in `docs/systems/UNMAPPED`. Today it prints: 34 citations resolve, 295 source files accounted
for. `UNMAPPED` shrinks as step 37 proceeds, and the count is on every commit.

**The pilot's yield, which is the argument for step 37.** Corporate credit alone produced §3 steps
33–36: seniority priced into every spread and never honoured in a waterfall, a credit event that
can only ever be a missed payment, no restructuring anywhere in the codebase, one rating held by
nobody. Four absences from ONE tree of forty-five, none of which any previous sweep reported.

**Scale, measured:** 68,788 lines over 295 files, 76 stages, 72 domain modules. The 45 systems are
grouped INFRASTRUCTURE (6), MARKETS (16), FINANCIAL INSTITUTIONS (7), PUBLIC SECTOR (2), FIRMS (5),
THE REAL ECONOMY (6), CROSS-CUTTING (3); granularity rule, stated in the README so the count can be
argued with: **a system is something with its own required tree — its own instrument, actor or
mechanism that could be wholly absent.** That is why banks are three trees and derivatives are five.

**Also fixed here:** two §3 steps both numbered 33 (the atlas pilot's findings collided with the
long run), so the long run is now 38 and its precondition reads 1–37; the parts renumbered so the
new mapping part is VII and MEASURE ONCE is VIII, which keeps the long run last where it belongs.

**13c-FX-2 — THE DESKS SQUARE WITH EACH OTHER, AND THE TRADE AGGREGATE IS DELETED.** Two halves.

**THE SWEEP: a firm does not keep money it has no use for.** Any foreign balance beyond what a
party is about to pay out in that money is sold back to the desks. That is what a treasury does,
and it is what keeps a foreign-currency account MEANINGFUL rather than dead (nobody holds one) or
unbounded (everybody hoards): a party with a real ongoing obligation in a money keeps enough to
meet it and sells the rest. Measured: non-bank foreign holdings went from **+88.3B across 3,528
non-zero rows to 0.0B across 48** — the rows that survive are the parties that genuinely owe in
that money next week.

**AND IT WAS NOT ENOUGH, WHICH TAUGHT ME THE ACTUAL STRUCTURE.** The desks' book kept growing
(−390.6B week 1 → −601.4B week 4) because the sweep can never reach the other side: a US desk
sells euros to a client, the euros land on a euro-area payee as its HOME money, and home money is
never swept. The desk's short is real, unfunded and one-directional.

**But the shorts are SYMMETRIC, and that is the mechanism.** US clients buying euros leave US
desks short euros; euro clients buying dollars leave euro desks short dollars. A US desk short
euros holds dollars; a euro desk short dollars holds euros. **They swap, and both books go flat**
— no third party, no warehoused residual, no unowned leftover, which is why this needed none of
the residual-ownership decisions `fx-clearing`'s XB6 comment deliberately left open. That is what
an interbank FX market IS: dealers offsetting each other's client flow, with only the net ever
reaching anyone else. Week 1 fell from **−390.6B to −45.8B**.

**THEN THE AGGREGATE COULD GO.** `fx-clearing.ts:108` read
`ctx.bilateralTradeWeeklyUSD[exporter][importer]` — a derived aggregate standing in for orders
nobody places, and a second representation (rule 4) of a conversion the ledger now performs for
real. It is replaced by the desks' actual books: inelastic, because a desk short a money it does
not issue must cover and an uncovered nostro is an overdraft rather than a position it chose. The
flow the auction prices is now ~50B of real net imbalance instead of the gross it stood in for.

**MEASURED, 16 weeks: 243 in 48 → 241 in 47.** Against the 231-in-46 baseline what remains is
sovereign and register, not money: `O1 sovereign held = outstanding` (EUR, JPN), `O3 register rows
name a live instrument`, and the harness's EUR sovereign-bond invariant — all 13-SOV's. 4 weeks
stays at the baseline's 50 in 19.

**WHAT IT DID NOT DO, stated plainly.** The book is bounded per week but the NET still drifts:
−45.8B in week 1 to −181.3B by week 16, gross 45.8B to 227.2B. The runaway is gone (+53B a week
off a huge base became −8.5B a week off a small one) and the drift is not. It is the one-way flow
the elastic side cannot absorb, it is `residualByPair`, and it is §6.1's FX row — logged as
13c-FX-3 with the three candidate causes and the instruction to measure before touching any.


**13c-REVAL — A BALANCE IN SOMEBODY ELSE'S MONEY IS WORTH SOMETHING ELSE WHEN THE RATE MOVES.**
Nobody pays anybody, so it is not a payment and it cannot go through `pay()`: it is a MARK, and
the holder takes it as an unrealised gain or loss. Until this stage the model had nowhere to put
one — `trade-settlement.ts`'s invoice gap was the only instance anybody had written.

**Most of it needed no booking at all**, which is the point of §3.13's rule that value is a
function and never a field: `cashOf`, `entityCashOf` and `bankReservesOf` convert every row at the
rate in force, so a firm's cash is worth what it is worth the moment the rate changes. What broke
were the STORED numbers beside those reads — a bank's equity, a central bank's sheet — written in
a week whose rate is gone.

**The method is two reads, not a formula.** Value the book at the OLD rate, promote the rate,
value it again, book the difference. No assumed exposure: the difference between two reads of the
same balances IS the exposure. A bank's equity takes the whole of its move (it is the residual
claim; a depositor's foreign balance revalues on the depositor's book and against the bank as a
liability, and the two net). A central bank gets the thing a central bank actually has for this,
a **revaluation account** — two lines on its sheet are held in the numéraire rather than locally,
the official claim (which must be, or the world's bilateral sum is an exchange rate) and the FX
reserves, so a rate move changes their worth in that book while nothing else moves. It is not
remitted: the sheet's "no retained earnings" note is about INCOME, and a translation gain is not
income until it is realised.

**MEASURED, 16 weeks: 251 in 51 → 243 in 48. The whole M family is gone** — `M1 central bank
closes` in all four regions and `M5 bank sheet closes` on all three US banks that carried a
foreign position. Against the 231-in-46 baseline exactly two families remain, and neither is a
money identity: `O1 sovereign held = outstanding` (2.33% USA week 6, 3.33% EUR week 12 — holdings
converted against an outstanding that is not, which is 13-SOV's) and `O3 register rows name a live
instrument` (13 rows worth 0.00B). 4 weeks stays at the baseline's 50 in 19.


**13c-FX — A PARTY THAT MUST PAY IN A MONEY IT DOES NOT HOLD BUYS IT.** §9.13c part 2 settled a
cross-currency payment by debiting the payer in its own money and crediting the payee in its. Asked
whether that was the real-world mechanism, the answer was no, three ways:

  **(a) it made the per-currency account dead code.** No party ever ended a week holding a second
  currency, so the structure the whole step exists to build was never used — which is the tell;
  **(b) rule 4 — the conversion was already modelled.** `fx-clearing.ts:108` reads *"an importer
  sells its own money to pay an exporter in the exporter's"* and puts that flow in the book that
  clears the rate. The ledger did the same conversion a second time, at mid, with no counterparty,
  at last week's snapshot rate while the market priced the identical flow at this week's;
  **(c) it had no payer.** `05-unit-bidding:2126` already charges a desk spread on exactly this
  flow, from a named payer, and the ledger's free conversion undercut it.

**The mechanism instead.** A payment moves ONE currency: the payer pays euros, the payee receives
euros and HOLDS them. A party short of a money BUYS it — from its own region's desks, at the
cleared rate, paying the pip (`fx-funding.ts`, at the head of every settlement pass, so the
purchase and the payment that forced it settle together, rule 5). A party short of its OWN money
while holding somebody else's SELLS, rather than overdrawing, which is what stops a seller paid in
a foreign currency hoarding it forever. **The "every US bank short 23B of euros after one week"
that made me convert at the ledger was never an argument against this: it was the missing purchase
showing up as a negative balance.**

**THE ONE TALLY THE ROWS CANNOT GIVE, AND WHY IT BROKE.** A bank's own income and expense is not
readable off its rows' deltas — the deltas cannot tell a customer's money from the bank's — so it
is accumulated leg by leg as it settles (`ownNetByParty`). Accumulating four currencies into it RAW
put a US bank's equity at **−23.75B** in week one, the first week its desk sold euros. It converts
into the bank's own money now, at the pass's rate.

**THREE THINGS THE PASS FOUND, EACH ONE A READ DISAGREEING WITH ANOTHER READ.**

1. **A bank's own income cannot be summed across currencies.** It is the one tally the rows'
   deltas cannot give — the deltas cannot tell a customer's money from the bank's — so it is
   accumulated leg by leg as it settles (`ownNetByParty`). Accumulating four currencies into it
   RAW put a US bank's equity at **−23.75B** in week one, the first week its desk sold euros.
2. **A resolution assumes a POSITION, not its value.** The failed bank's foreign rows stayed on
   the shell when only the home-money total was paid across, and the guard found **16.7M still on
   QYTV** in week 12. It moves money by money now, and the legs sum to exactly the `cashUSD` the
   plan struck the shell's equity on.
3. **THE RATE CANNOT MOVE INSIDE A WEEK.** With `v2.fx` written by the auction mid-pipeline, a
   resolution valued a failed bank's book at the post-auction rate (`bankReservesOf`, off the
   world) while settlement paid it away at the pre-auction one (`ctx.fx`, a snapshot) — and the
   **134.8M** difference, which is a revaluation, was reported as money left on the shell. It had
   already shown up once as a 0.04B hole between settlement's gross and the wire summary, and I
   had patched THAT by copying the table onto the context, which fixed one pair of reads and left
   every other pair broken. The real rule is one rate per week: the auction writes `v2.fxNext`
   and the next week's open promotes it (`openFxWeek`). `ctx.fx` is the world's table again, so a
   stage, an audit and the UI cannot read one balance three ways.

**AND A BANK IS THE MARKET, NOT A CLIENT.** Every kind excluded from the funding pass is one whose
foreign position is a POSITION rather than a shortfall: a desk's is its inventory, a bank's own
account is its nostro — and a nostro runs overdrawn, which is exactly what an unsquared spot book
looks like on a balance sheet.

**MEASURED.** 2 weeks 20/12, 4 weeks **50 violations in 19 families — the baseline, family for
family**, with parties genuinely holding and trading four currencies: 2,579 home-currency rows and
5,257 foreign, 3,528 of them non-zero. 16 weeks: 251 in 51 against the baseline's 231 in 46, and
every new family is downstream of the two mechanisms this step does NOT yet have — nothing books
an FX gain, and nothing flattens the desks' book. The desks carry the other side, as they must:
−537.7B of foreign currency against +88.3B held by everyone else at week 3, and by week 16 the UK
central bank's reserves have run from 92.5B to 6.4B behind it. That is a real position going
unsquared, which is 13c-FX-2, not a defect in this one. Per rule 13, nothing is rolled back
because the 16-week print is 20 violations uglier than the version this replaced: that version was
structurally wrong — its per-currency accounts were dead code and its conversion was a second
representation of an event the FX book already prices.


**13c — CURRENCY IS A UNIVERSAL CHARACTERISTIC (parts 1 and 2).** The `USD` suffix was a lie
repeated 11,243 times across 1,395 identifiers. `currency.ts` said in its own header that every
figure is held in the money of whoever owns it and that nobody re-denominates — and then `pay()`
took an amount, a payer and a payee and converted **nothing**, so a German firm paying a US
supplier took euros out of one balance and put dollars into another, and the wire ledger balanced
because it was adding two numbers that are not the same kind of thing. Nineteen `convertLocal`
call sites existed, every one in a DECISION stage comparing a foreign quote, and **none where
money actually moves**. `grep "currency"` across all of `engine/ledger` and all of `engine2`
returned one hit, and it was a formatter.

**What landed.** `CurrencyCode` is a type, not a suffix, and `currency.ts`'s primitive is keyed by
currency rather than by region — a region is a place, money is money. `v2.fx` is the world's one
rate table, written by the FX auction and by the seed and read by the ledger, the audits and the
UI; it lives on the world because a balance cannot be read without it and reads happen where there
is no context. **An account is (party, currency, bank)**: a party holds as many rows as it holds
currencies, and what it is WORTH is a conversion, never a bare sum. `pay()`, `payByIds()` and the
payment journal carry a currency, and ~120 call sites now say which money they move. Money is
**four assets** in the wire ledger, not one called `USD`; a unit of a currency costs one of itself,
which is the one hard-coded 1 that belongs (§3.13's degenerate case).

**THE RULE THE LEDGER SETTLES BY, and the measurement that chose it.** The first cut landed the
raw foreign amount on both books. Measured after ONE WEEK: **every US bank short 23B of euros, 8B
of sterling and 22B of yen** — a payer with no balance in a money it never held simply went
negative in it. A party short a currency it does not keep is not a funding position, it is a
missing conversion. So: **a payment is denominated in ONE currency and each side lands in the money
it keeps its books in.** The payer's bank debits it in its own money and delivers the currency the
obligation is in; the payee's bank credits it in ITS own money. Value is conserved because both
legs are the same amount of the same currency through the same rate, and it is exactly
`currency.ts`'s own rule that nobody re-denominates. 155 violations → 88.

**WHAT A PAYMENT'S CURRENCY IS, and where it comes from.** The obligation's, and the obligation
belongs to somebody: a wage to the employer, a coupon and a redemption to the paper (off the
holding row's own `regionRef`), a tax to the treasury, a derivative's margin to the market it
trades in (`c.regionId`), a stock loan's collateral to the money the shares are quoted in, a
fund's call and fee and distribution to the FUND — never reflexively to the payer, because a
capital call is paid BY the LP and owned BY the fund. `obligationCurrencyOf(v2, obligor)` names the
owner and reads the money its account was opened in, which the seed took from its region. Nothing
is left settling on a convention.

**EVERY LEDGER IS ONE BOOK'S, SO EVERY LEDGER READS IN THAT BOOK'S MONEY.** The settlement report
was adding euros to dollars in six places at once — the treasury's flow statement, the household
sector's, the pools', the cross-border position, the banks' reserve tallies, and the world's
central-bank identity. Each is now struck in the money of the book that reports it, and the two
figures that genuinely span every book — the settled gross and the central banks' residual — in the
numéraire, computed while the ROWS are in hand rather than by summing four per-book maps. 88 → 51.

**THREE THINGS ONLY THE CONVERSION COULD HAVE FOUND.**
1. **`ctx.fx` cannot be a live reference.** Settlement converted the week's gross at the pre-auction
   rate and the wire summary valued the same wires at the post-auction one: W1 reported a 0.04B
   hole that was an exchange rate moving between two reads. The week's rates are snapshotted at
   the open; this week's auction sets next week's.
2. **W1 can never be exact in one money.** A dated row is wired in one week and settles in another,
   at another rate. The identity is now per currency, in that currency's own units, where it is
   exact and needs no rate at all — the `moneyByCurrency` / `grossByCurrency` pair.
3. **A bilateral claim needs ONE denomination.** `foreignOfficialClaimsUSD` booked in each central
   bank's local money left the world's sum non-zero by 3.0M whenever a rate moved after the flow —
   a revaluation, not a missing leg. It is carried in the numéraire on both sides now (one of the
   few fields whose `USD` suffix is literally true) and `centralBankAssetsUSD` converts it into the
   book's money.

**A `!` IS A CLAIM, AND TWO OF MINE WERE FALSE.** `securities-lending.ts` read
`currencyOf(issuer!.region)` inside the branch whose CONDITION is `!comp || !issuer` — the branch
that exists precisely because the issuer may be gone — and it threw in week 5 of the reference run,
after four clean weeks. `shared-helpers.ts` did the same at a site where `issuer` is `undefined`
for every non-equity instrument. The lesson is not "check for undefined": it is that a currency
should be read off the PARTY that owes the money (`obligationCurrencyOf`), which always has one,
rather than off an object that may have stopped existing. A short run is not evidence; four weeks
passed and the fifth was where the name died.

**Two defects of my own, caught by the same process.** The seed's funding residual read a bank's
deposit line before the bank had a currency, so the SME line came back zero and the household
residual swallowed it — **10.6B on the largest US bank**; a deposit line now takes the bank's
currency from the caller, because every caller holds the bank. And the read paths were calling
`internString`, which MUTATES: a lookup that misses appends, renumbering every id assigned after
it. `stringRef` reads without appending.

**MEASURED, 4 weeks, SHOCKS=0.** Baseline 50 violations in 19 families. With every region forced
onto one currency the run is unchanged through week 3. With the real four currencies and the whole
ledger converting: **50 violations in 19 families — the baseline, family for family.** Every
identity that broke has been made to read in one money and every one closes.

**MEASURED, 16 weeks: 248 in 48 against the baseline's 231 in 46.** Four families go and six
arrive, and the six ARE THE NEXT FINDING rather than plumbing left undone. They fire late (weeks
6, 12–14) and they are small (`M1` 0.04B EUR, 0.20B JPN, 0.27B UK on sheets of ~180B), and every
one of them is downstream of the same missing mechanism:

  **NOBODY BOOKS AN FX GAIN OR LOSS.** A balance held in a money that is not yours is worth a
  different number when the rate moves, and this model has nowhere to put that. The central banks'
  claims on each other are the clearest case: the claim is one bilateral number in the numéraire
  (it has to be, or the world's sum is a revaluation — see above), the reserves that funded it are
  in each region's own money, and when a rate moves the two sides revalue by different amounts.
  `M1`'s residual IS that revaluation, and `centralBankAssetsUSD` converting the claim at this
  week's rate is what makes it visible rather than what causes it. The same shape reaches
  `M5` on the one US bank that funds a foreign customer, and `O1 sovereign held = outstanding`
  (2.3% USA week 6, 3.9% EUR week 12) is holdings converted against an outstanding that is not.

  This is a MECHANISM, not a bug: an unhedged foreign position has a P&L, and until it is booked
  the identities that span two currencies cannot close. It is 13c's next slice and it is what the
  transaction-FX gap in `trade-settlement.ts` (`tradeInvoiceFxGainUSD`, already computed and
  already real) is the one existing instance of. Per rule 13 nothing here is rolled back to make
  the print smaller; per rule 11 no judgement is offered on the levels.

Tests 135, eslint 341, hygiene and build pass.

**The levels move, and they should.** A US household buying a euro-priced lot used to pay the euro
number as if it were dollars — a 34% discount on every foreign good. That is corrected, and it
moves reserves, trade and bank balance sheets. Per rule 11 no judgement is offered on whether the
new levels are right; only that the identities close.


**O8 — one piece of paper, one name.** (`PENDING`) Asked why one holding has two possible keys,
the answer turned out to be worth measuring rather than asserting. The first version of O8 counted
issuer-named rows in the REGISTER and came back **clean** — the register is entirely tranche-keyed
(the seed opens issuer-named at `initialization.ts:548` and the books convert it in week 1). So
the second key is not in the register at all. It is the **dealer desks**, and they are not partly
on it: **11,655 credit positions worth 301B are keyed by ISSUER and not one names a tranche.**

The two key-spaces are disjoint, which is the worst case: every move between a desk and the
register crosses them, wiring a sale of one name against a purchase of another for the same paper.
They net in USD within a kind, which is why `W2` reports only the residue rather than the whole
301B — and that residue is a real one, 32 findings a run, and it feeds `O7`.

The history is plain enough: the register was migrated to per-tranche rows and the desks were left
behind. Folded into step 13, which owns the per-tranche world; O8 is the number to drive to zero.
Measured: 165 in 35 → **181 in 36**, the whole rise being O8 firing every week on a defect that
was always there.

**13 (part 4). The abstraction forces units.** (`PENDING`) The previous attempt bolted a price
onto the side of a value, which is not foundational: a side table can be absent, ignored, or
disagreed with. The type has to make a valueless position impossible to express, and the
compiler has to find every place that made one.

Two changes, and between them they are the foundation:

**Every asset kind declares what its quantity is COUNTED IN.** `AssetModule.countedIn` —
`PAR_USD`, `SHARES`, `GOODS_UNITS`, `CONTRACTS`, `USD` — is required, so a new kind does not
build until it has answered. Rule 9 says periodicity and the unit of meaning are part of a
number; this is that rule applied to the quantity, and it is the half that was missing. **Money is
the one kind counted in dollars, and its price is 1 BY DEFINITION** — a test asserts nothing else
claims that.

**A holding carries `units`, required.** The compiler named every writer that did not set one:
**21 errors across 12 files**, which is the whole set — small, because writers are few and readers
are many, and this is the cheap end to start from. Units are shares where the instrument is
share-counted and par everywhere else. The store's column follows: what was added as `faceUSD`
last commit IS the units column and is now named that, because face for credit is exactly "how
many units" — one column whose meaning is the registry's `countedIn`, not two that overlap.

**Nothing reads units for value yet, so the run is unchanged at 231 in 46** — and that is the
last commit for which that is true. Units are now written everywhere and correct; the next step is
that value STOPS being a stored field and becomes `units × price`, and the balance sheets move.

**13 (part 3). The mark: built, measured, and deliberately not wired.** (`PENDING`) This is the
big one and it did not land. The record is what it produced, because the next attempt should start
from here rather than from the top.

**What is in the tree and staying.** The register carries `faceUSD` beside `quantityShares` — the
same idea, for the same reason: storing only the value makes the size of the book depend on the
price the book is supposed to set. `markCreditBook` in the holdings ledger walks a holder's credit
rows, fixes the face from the value a book wrote it with, and re-marks the value to face × price —
no wire, because a price move is not a trade, which is the rule `markHolding` already stated for
one row. `engine/credit-price.ts` is the ONE adapter between the world's stores and
`domain/pricing`, so the stage that marks and the check that tests the mark cannot disagree about
what the price is. `stages/credit-marking.ts` is the stage. The books write `faceUSD` on their
fills.

**What it does.** With the stage wired, 130,000–200,000 rows re-mark each week and **25B–38B of
value moves**. That is the defect being removed, and it is the right order of magnitude against
P5's sizing.

**Why it is not wired.** Turning it on takes the run from **231 in 46 to 426 in 61**, and the
cause is not the mark — it is that the model is not ready to hold face and value as two numbers:

1. **Face leaks.** `creditRow` adds to the value and only adds to the face when its caller passes
   one, so every non-book path that touches a credit row drives face below value. This was
   isolated by running with the mark OFF and only the audit reading face: `O1` fired 16 weeks of
   16 at −92B, −128B and −237B, and `O6` at −461B. With face and value identical the same run is
   231 in 46. The divergence is the leak, and it is a small enumerable set of call sites.
2. **The mark is not the last word.** Wired after `holdings-writeback`, stages after it and next
   week's books write rows back in par space, so the register ends the week part marked and part
   not — and P5 then reports 357.89B marked against 424.50B implied, which is the un-marked half.

**The lesson, and it is the same one twice now.** A value that two subsystems disagree about
cannot be introduced by marking one of them: every writer and every reader has to move in the same
commit, or the identities that compare them start measuring the price instead of the ownership.
The keying step (§9.12) worked precisely because the desks' store and the auction's read were
separated FIRST and the key changed second. Face needs the same: make every writer maintain face
while face still equals value — where nothing can break, because the two numbers are the same —
and only then let them diverge.

**13 (part 2). The two curves, measured — and the coupon moved onto the cleared one.** (`PENDING`)
A new issue's coupon is struck at "the cleared terms", which sounded settled until you ask WHICH
curve. `stage08-back:1498` read the Nelson-Siegel FIT (`yieldCurveParams`) while `zeroRates` — the
points the auctions actually cleared — is what P5 and most consumers value the resulting paper
against. `P6` now measures the gap: **all twenty tenor points disagree, worst 36bp.** A coupon set
on one curve and a price taken on the other puts a brand-new bond away from par the week it is
born, and that is not a market moving.

The coupon now reads `zeroRateAt(zeroRates, STANDARD_CORP_TENOR_YEARS)` — the cleared points, at
the tranche's OWN tenor, so the two stay linked if that tenor changes. **It picks a side of a
two-sided defect**, and the side is rule 3's: a cleared price is the truth and a fit is a
convenience. `index-calculation` and `12-portfolio` still discount with the fit, so the model is
not yet consistent — that is step 25, which P6 now sizes.

**It did not improve the number and it is kept anyway** (rule 13). Measured (SHOCKS=0 WEEKS=16):
232 in 46 → **231 in 46**; P5's mismark moved 127.9B → 143.5B and P6's worst 28.5bp → 36.0bp,
both on the re-path rather than on the mechanism — the fitted 5Y sat 3bp BELOW the struck one, so
the direct effect was to raise coupons slightly and make the book worth MORE. Two curves cannot be
made consistent by choosing between them at one call site; they are made consistent by there
being one, which is step 25.

**13 (part 1). What "credit trades at par" is worth: 127.9B.** (`PENDING`) The defect has been
in the plan since the audit and nobody had ever put a number on it. `P5` does, using the pricing
module 12b built: take every live tranche, take the spread its own book cleared — the issuer's OAS
for a bond, its discount margin for a loan — and price the paper's real cash flows against the
region's real curve. Then compare with what the register says it is worth, which is its face,
because `holdings-ledger.ts`'s `priceOf` returns 1.00 for every notional instrument.

**1,033.5B of face is worth 905.6B. The mismark is 127.9B, about 12% of the credit book**, and it
points the honest way: spreads widened over the run, so the book is worth less than the par it is
carried at. A bond whose issuer's spread doubled is still marked at 100.

Two caveats recorded at the check rather than left for someone to rediscover. A floater is
compared against its ISSUER's cleared discount margin, because that is the only cleared margin
there is, so a tranche whose own locked margin sits far above it prices far above par — and the
widest of those trace straight back to `P1`'s inverted spreads (a 5540bp facility against a
1011bp bond). They are a handful of small tranches and they do not move the aggregate. Where they
DO matter is as a second reading on P1: a spread that produces a price of 15× face is not a
spread, and P5 makes that visible in dollars rather than basis points.

Measured (SHOCKS=0 WEEKS=16): 200 in 44 → **216 in 45**, the whole rise being P5 reporting every
week.

**12b. Pricing is centralised.** (`PENDING`) The time value of money was written out by hand in
eight modules — `Math.pow(1 + r, -t)` and `(1 - that) / r` and `r / (1 - that)` — each copy with
its own variable names and its own edge cases, so a reader had to prove to themselves that three
files computing `rWeekly / (1 - (1 + rWeekly) ** -n)` meant the same thing. They do.

`domain/pricing/` owns it now, in two modules with one job each: `discount.ts` for the primitives
and `bond.ts` for price-from-spread and its inverse. Nothing in either reads the world, which is
what makes them testable and what keeps the pricing out of the stages. Migrated:
`call-protection.ts` (which was carrying its own complete bond PV), `company-week/debt-ladder.ts`,
`engine2/stage08-back.ts`, `index-calculation.ts` (a fourth copy of the bond PV), the mortgage
level payment in `domain/banking.ts`, `bank-lending.ts` and `evolution.ts` — three byte-identical
copies — and `asset-allocation.ts`.

**Three bounds died with them.** Each hand-written annuity carried `Math.max(1e-6, rate)` because
`(1 - DF) / r` divides by zero. The shared one takes the limit exactly — ten payments of one are
worth ten — so the floor is unnecessary, and with it goes the quiet lie that a negative rate is
0.0001 (rule 6, and the model's own policy floor is −1%).

The new pair `priceFromSpreadBps`/`spreadBpsFromPrice` is step 13's foundation and has no callers
yet. It is solved rather than approximated: price falls monotonically in spread, so the inverse
bisects and a price fed back gives the spread it came from. **Every cash flow is discounted at its
OWN tenor** — the curve's rate where that payment lands, plus the spread, which is what an OAS is
(one spread over the WHOLE curve, not over a single point on it). The first draft took the
shortcut and discounted the schedule at one rate; `engine/pricing.ts`'s condemned
`priceCorporateBond` does the term structure properly, and a replacement that is worse than what
it replaces is not a replacement. Eight tests pin the properties: the round trip, the zero-rate
limits, and that a steep curve prices a coupon bond ABOVE a flat one at the same long rate —
the assertion the shortcut fails.

Measured (SHOCKS=0 WEEKS=16): 197 in 44 → **200 in 44**, the difference being the three floors no
longer rounding negative and near-zero rates up, plus the P- and X-family re-path that follows
(X1 improved, 9 weeks → 5). Tests 126 → 134.

**12. One thing, one key.** (`PENDING`) Asked whether anything else was miskeyed, the answer had
to be a sweep rather than an opinion. `O8` now states the policy and tests every arm of it every
week: a company is its id, an institution is its id, a piece of paper is the instrument it is, a
good is its sub-unit, a contract is its own id and what it is written ON is keyed the way that
thing is keyed.

**The sweep came back with exactly one offender.** Contract parties resolve, CDS reference
entities resolve, and every register row names something that exists — three arms clean. The
desks were the whole of it, and they were not partly wrong: **12,043 credit positions worth
365.5B on the issuer key and not one on a tranche**, because a credit book's clearing INSTRUMENT
is the company (`dealer-desks.ts` keys the book by `inst.id` and 07b's instruments are
`regionCompanies`), while the register had already migrated to tranches.

The fix separates the two: **the desk STORES the paper's name and the auction READS the issuer's.**
`clearingKeyOf` maps a stored tranche back to the instrument the book prices; `priorByClearingKey`
gives the auction the aggregated view it always had; and a credit fill is split across the
issuer's tranches on the way into the book, by the same face weights the register uses, with a
short position keeping its sign. Nothing about the clearing changed — only where its result is
filed.

Measured (SHOCKS=0 WEEKS=16): **365.50B on the wrong key → 0.42B, 20,341 positions now named by
the paper they are.** And **"the money that is not anyone's" reaches 0.00B across ZERO lines** —
the money family is completely clean for the first time.

The count went 181 in 36 → **197 in 44**, and the rise is worth stating plainly: `O1`, `O6` and
`O7` can now SEE the desks. A position naming no tranche could never be compared to a ladder row,
so 300B of credit inventory sat outside every per-tranche check in the audit. On the right key it
is measurable, and what it measures is 11f — the register and the desks together hold more of some
tranches than were issued. That defect did not arrive with this commit; it stopped being
invisible.

**11f (part 1). O7 — the invariant that only ever fired as a crash, and two dead hypotheses.**
(`PENDING`) `estate-resolution.ts` carried a `defect()` that killed the run when an estate's
register claims exceeded the ladder's face on one tranche. It fired for the first time this
session, on a re-path, at 0.626M against 528.1M — and under rule 7 that is not dust, it is a real
over-issuance. But the guard could only ever speak about a firm that happened to DIE inside the
measured window, so what it really reported was which firm died first.

**`O7` replaces it: no tranche is claimed beyond its face, measured every week for every issuer**,
with a dust bound derived from the row count and the face rather than a percentage. It fires
immediately and widely — **~55 tranches in a typical week**, up to 105, and it names SICM's
week-11 primary at exactly the +0.626M the estate died on. The `defect()` is gone: one invariant,
one reporter, and a number instead of a landmine.

Two hypotheses were spent and both are recorded in §3 so nobody repeats them. The second cost a
full run and is the more useful: a position IS re-keyed between tranche-named and issuer-named
rows every week (the split's issuer fallback fires 3,620 times in 13 weeks), and keeping an
untouched position's rows verbatim **made O7 worse — 105 tranches and 0.10B against 55 and
0.01B** — while moving W2 not at all. The oscillation is a real defect and it is not this one.

**11g. The stock loan's missing wire, and the fund that lent to itself.** (`PENDING`) Landed once
O7 retired the crash that was blocking it. `securities-lending.ts`'s `deliver` moved shares
between two books with `store.addShares` on each side and no instruction — the last such path in
the tree. It now emits `wireHoldingMove` first: a new export of `holdings-ledger.ts`, the
instruction alone, for a mover that owns its own row writes, which is what a stage inside the
clearing store's window is.

Wiring it exposed the second half immediately, because the ledger refuses a move from a party to
itself: **the borrow demand was spread across every lender INCLUDING the borrower**, so a fund
borrowed its own shares — posting collateral to itself, paying itself a fee, delivering from a
book to the same book. It cancelled silently for the life of the model. The borrower is now
skipped in its own lender pool and fills LESS rather than more, because re-spreading that slice
over the other lenders would let one of them lend what it does not have.

Measured (SHOCKS=0 WEEKS=16): 157 in 35 → **165 in 35**. W5 fires in more weeks (8 → 12) but the
gross it reports collapsed from **~300M shares a week across ~40 books to ~9M**, and every
remaining gap turned the same sign — which is 11f. The rest of the rise is P- and X-family
market-behaviour lines that rule 11 says not to judge yet.

**11e (part 4). W5 — the register's replay, and what it caught immediately.** (`PENDING`) The
register was wired in part 3 but nothing CHECKED it. W5 does: the register's change is the replay
of its wires, **in shares, never dollars** — a value-keyed register would move every week on the
marks and could never equal its wires, which is the same reason W3 works on ladder FACE and W4 on
goods UNITS. Only kinds held in shares that are asset kinds in their own right are claimed; the
notional kinds join when step 13 gives a holding a face separate from its value.

Two things had to be got right and the first attempt got both wrong, which the instrument said
straight away:
- **An issuer is not a holder of its own instrument.** A vehicle's shares are issued BY the
  vehicle, an institution like its holders but with no register row of itself, so its leg moves no
  row and must not net against the holder's. Without that, every ETF creation cancelled itself and
  W5 reported 777M phantom shares in week 1.
- **Entity ids are not unique across kinds.** The fix for the above tested `party.id === asset`,
  and a seeded institution carries its COMPANY's id (`initialization.ts:918`), so ordinary equity
  wires started dropping real holders' legs and EQUITY lit up instead. The test is now asked only
  of a vehicle claim, where the id genuinely identifies the issuer.

Measured: **142 in 34 against 134 in 33, and the ONLY new line is W5's** — nothing else moved by
one violation, which is also the proof the audit stays pure (it reads the register through
`materializeBook` and perturbs nothing).

**And it found something on its first run.** W5 fires in 8 weeks of 16 on EQUITY, always with the
same sign — the register grows by more than its wires. That is now step 11f.

**11e (part 3). The register opens by wire too.** (`PENDING`) `ensureBooksSynced` mirrored
`itemizedHoldings` straight into rows, so the world's opening holdings existed because an array
said so — the issuers' side of the same gap `seedLadder` had. `seedBook` claims the chain empty
and ISSUES each opening position through `issueHolding`, the same call a primary settlement or an
ETF creation uses, with the issuer the instrument itself names: the firm for equity and corporate
paper (the instrument id IS the company's id), the treasury for a sovereign bucket, the fund for
its own shares.

Two details worth keeping. `ensureBooksSynced` STAYS as the read-side catch-up — `holdings-view`
calls it three times from paths where no wire journal is active, so the wires could not live
inside it; the seed runs first in core and leaves it a no-op. And rows MERGE by (type, instrument)
on the way in where the mirror made one row per array entry, which is lossless: it is what
`consolidateRegister` does to the register at the close of every week anyway.

The hygiene gate earned its keep on this one. The first version asked
`h.instrumentType === 'GOV_BOND'`, and the asset-switch ratchet refused it at 55 against a budget
of 54 — the registry answers that question (`holdingClassOf(...) === 'SOVEREIGN'`), which is both
shorter and right for a kind nobody has added yet.

Measured (SHOCKS=0 WEEKS=16): **134 in 33, violation set identical line for line** — the third
slice in a row that costs nothing and buys provenance.

**11e (part 2). The goods were never seeded at all.** (`PENDING`) The step listed the opening
goods pipeline as unwired. It is not: no firm is generated holding finished stock
(`companyGenerator.ts:703,1303` open `outputInventoryBySubUnit: {}`), no input lot is seeded, and
the seeded in-transit consignments carry no `carrierTicker`, which is exactly the case
`goodsUnitsByKey` does not count as stock — they pass through a sink at dispatch and reappear by
wire on arrival. **The world starts with no goods**, so week 1's stock is precisely what week 1
produced plus what its wires brought in: W4's own identity, with nothing special about it.

So the slice is the audit's half alone — `goodsUnitsByKey: {}` in the opening snapshot — and
**W4 does not fire.** Measured: 134 in 33, violation set identical again.

The lesson is worth more than the line: **check whether the thing you are about to wire exists.**
A step written from a file:line read said the pipeline was seeded without wires; it was seeded
without goods. One grep of the generator would have said so before any of it was designed.

**11e (part 1). The world's opening ladders open by wire.** (`PENDING`) `seedLadder` installed a
seeded or born firm's ladder by mirroring `comp.debtTranches` into rows with `wireRef` set to −1
on every one — face that existed because an array said so. Its own doc said as much: "installed
without wires — principle B's gap". It now claims the chain empty and ISSUES each tranche through
`issueTranche`, the same call every other week uses, so the wire names the issuer and the holder
the tranche names.

That could not work where it stood, and the reason is the finding: **the ladder catch-up ran
BEFORE the week's wire journal was installed**, so a wire written there would have thrown. It now
runs immediately after `setActiveWireJournal` and still before the first stage, which is the
constraint that put it where it was.

The other half is the audit's. Week 1 had no "before", so every week-over-week check skipped it
and the opening world was the one state nothing ever proved. It has a before — the EMPTY world —
and `lastSnapshot` now starts as one, claiming the ladders only. **W3 does not fire: the seed's
wires reproduce the world's opening ladders exactly.** The goods and register keys stay absent
(an absent key skips its check) until those are wired too, which is 11e's remainder.

Measured (SHOCKS=0 WEEKS=16): **134 in 33, and the violation set is IDENTICAL line for line** —
a week of the model's history that nothing could check is now checked, at no cost. One new reason
string needed registering in `payment-category.ts`, which the gates caught immediately and which
is the whole reason that check exists.

**11d (part 2). The margin a client posts and never gets back.** (`PENDING`) Six hypotheses had
died (part 1, below) and the seventh was retracted before it cost a run. What found it was the
user's question: **can the individual wires not be followed to see what appears or goes missing?**
They can, and the answer was one line away.

`depositsOf` — the money stock's own definition — is four deposit classes PLUS
`bankBalanceSheet.clientMarginUSD`. Every other term in it is an account ROW; that one is a field
on the SHEET, so it moves without any settled row moving and no tally can see it. Putting the
region's week-on-week move of that single field into M6's message: **the client-margin line moved
2.55B — the gap to the dollar, first time of asking.**

Behind it were three defects in one mechanism:

**1. The margin is never returned.** `initialMarginUSD`'s own doc says it is "the A side's cash,
held by the B side". The tree contained exactly ONE margin payment — the posting, at
`fx-forward.ts:362` — and no second one anywhere. A contract matured, terminated on an event or
was closed out and the client's cash stayed with the desk for good. Every FX forward is written at
a 2% initial margin, so this ran every week of every run the model has ever done.
`releaseInitialMargin` now pays it back from the desk's securities account, on all three paths a
contract leaves the book by, to the party that posted it (a party that has ceased to exist has
nowhere to receive it — the same rule the close-out legs already follow).

**2. The sheet's line only ever grew.** `clientMarginUSD` ACCUMULATED each week's new margin and
nothing subtracted from it, while `initialMarginHeldUSD` beside it was summed from the live book —
two representations of one quantity (rule 4), one of which could only diverge upward. The sheet's
line is now a read of the live book.

**3. Encumbered collateral was counted as money.** Even with 1 and 2 fixed the identity does not
close: a client posting margin moves its deposit down and the desk's SECURITIES account up, which
every tally reads as the BANK absorbing the money, while the margin line put it straight back into
the stock — the same dollars on both sides. Posted margin is a bank liability and belongs in
`depositsOf` for the balance-sheet identity, but it is not money: the client cannot pay anyone with
it. `spendableDepositsOf` names that once and is used by M6, the audit snapshot and the UI — which
was already subtracting it inline, the tell that nobody thought it was a deposit either.

Measured (SHOCKS=0 WEEKS=16): **134 in 33, unchanged in total, but M6 goes CLEAN** and the money
family is down to ONE check — M7's 11 dust rows worth 0.00B. **M5 staying clean is the proof the
release fires:** had the cash stayed on the securities account while the liability line fell to the
live book's value, assets would have exceeded liabilities on every dealer bank. A new O4 line
arrives in its place, 2 facilities worth 0.00B in one week — dust, and a re-path, not a leak; it is
on the watchlist.

**The lesson: a money stock with a term that is not an account row cannot be audited.** Six
hypotheses and three runs went into the aggregates; the answer came from asking which part of the
stock had no wire behind it. When an identity will not close, look for the term that settlement
never touches.

**11d (part 1). Two silent drops closed, four hypotheses killed.** (`PENDING`) M6 stays open; what
this commit did was make it answerable. `core.ts`'s `byRegion` keyed the per-bank tallies off
companies filtered to `isBankEntity`, so a bank that stopped being one during the week — resolved,
or merged with its sheet cleared — had its whole delta dropped on the floor without a word. It is
now keyed off every company, with `state.companies` behind it, and whatever still finds no region
is NAMED (`bankTallyUnmappedUSD`) instead of absorbed. M6 reports it, and reports the active-bank
filter too whenever summing the stock over all of a region's banks gives a different answer.

Neither turned out to be the cause — both measured zero — and that is the value: **four
hypotheses are now disproved and recorded in §3's step 11d so nobody spends the afternoon on them
again.** The one that took longest to kill was the clearing house: its legs really are the bulk of
the cross-border total (UK week 8, hub −72.8B against real cross-region flows of −4.7B), which
looks damning until you check that money genuinely does move between regions through the hub. Two
more died cheaply afterwards and neither needed a run — the domicile-versus-bank-region suspicion
(every home bank is picked from the party's own region, so they are never different) and the hub
holding margin across a pass (M2's clearing-house residual is clean every week). A seventh was written down and then
talked out of on the arithmetic before it cost a run. What is left is a method rather than a
hypothesis: decompose M6 term by term across the two weeks, the way 11c was found.

`XBORDER_TRACE=1` prints the official-settlement leg per region, split hub and real, and stays.
Measured: **134 in 33, unchanged, and the family scoreboard is byte-identical** — which is what a
commit that only sharpens the instrument should look like.

**11c. The central bank's book drifts — the remittance under-counted its own expense.** (`PENDING`)
EUR's M1 missed by 0.08B and 0.10B in the last two weeks of sixteen: reserves plus the reverse
repo exceeded the assets they stand against. The plan guessed the reverse-repo book, which step 7
had just built. It was the wrong end.

The instrument found it, again, and the way it found it is the point. M1's message named two of
the six asset lines; it now names all ten components on both sides, and a `CB_TRACE=1` flag prints
the sheet EVERY week for every region, breach or not — necessary because the residual is
CUMULATIVE, so the week a leak is made is invisible in the week it finally breaches. Two runs of
that trace put the whole thing on one line: the residual sat at 0.1M through week 14, jumped 75.0M
in week 15, and in that same week the remittance collapsed to −0.1M from a −43M/−61M run rate while
interest on reserves halved to 38.2M with reserves unchanged.

**The central bank keeps no retained earnings** — its income less its expenses is remitted to the
treasury (or covered by it) the same week, which is exactly what makes its assets equal its
liabilities. Its interest on reserves is PAID by stage 02b, bank by bank, at stage 219. The
remittance then RE-DERIVED that expense at stage 395 by summing `reservesInterestWeeklyUSD` over
the region's ACTIVE banks — two representations of one number (rule 4), read 176 stages apart from
a set that `bank-resolution` (stage 390) had changed in between. A bank paid its interest and then
resolved dropped out of the expense; the reserves it had been paid stayed in the world, standing
against nothing. Week 15 measured it exactly: **113.2M paid, 38.2M counted, 75.0M short — the
residual's jump to the dollar.**

The expense is now accumulated on the central bank's sheet where it is paid, like the four smaller
lines beside it (`lastReverseRepoInterestUSD`, `lastLoanInterestUSD`, …), and the remittance reads
what was paid. `lastCouponIncomeUSD` and `lastInterestOnReservesUSD` complete the sheet's income
statement, so it can be read rather than recomputed.

Measured (SHOCKS=0 WEEKS=16): **136 in 34 → 134 in 33**, family diff a single line — **M1 goes
from 2/16 weeks (worst 0.10B) to CLEAN** — and **"the money that is not anyone's" 0.10B across 2
lines → 0.00B across 1**, which is M7's dust. The money family now prints one line in one week,
worth nothing.

Also added on the way, and it earns its place though it found nothing: **M2 reverse repo book =
lenders' parked cash**, the two-sided identity the loan book already had. It was written to test
the plan's hypothesis, proved it clean, and now stands as the check that the window closes.

**11b (part 2). A dead firm's goods still move — the deliveries follow the books.** (`PENDING`)
The money half closed earlier (below); what was left was `O5`, up to 196 consignments in transit
to a firm that is gone. The plan's diagnosis pointed at an estate that had closed and been
dropped. It was wrong, and the instrument said so on the first run: the O5 line now buckets a
dead buyer by WHY it is dead and whether the consignment has landed, and the answer was **100%
`bank/afloat`** in every failing week — not one estate, not one merger, every single one a bank
with goods still on the water.

`rekeyBankLinks` in `bank-resolution.ts` opens with "every link in the world that names the failed
bank now names the assuming one" and re-keys eleven of them — house banks, facility rows, repo,
prime brokerage, the offering pipeline, sovereign and desk accruals, derivatives. Consignments
were the twelfth and were not there. A bank buys goods like any other firm; the assuming bank took
the business and left the shipments behind, so what was afloat named a bank that no longer existed
and stayed afloat against nobody. Both bank outcomes are covered by this one site: a failing bank
is either recapitalised by its treasury (it lives, nothing to move) or resolved into an acquirer,
and the re-key runs on that path before the shell is marked defaulted.

The merger stage had its own copy of the same re-key. There is now ONE — `reassignConsignments` in
`goods-arrival.ts`, which owns the shipment type — used by the merger and by the resolution
(rule 4).

Measured (SHOCKS=0 WEEKS=16): **138 in 35 → 136 in 34**, and the family diff is a single line:
**O5 goes from 2/16 weeks (worst 196) to CLEAN**. Nothing else moved by one violation.
M7's 5–6 remaining rows are worth 0.00B and ride with 11c.

**The lesson, and it is the second time this project has paid for it:** the plan's written
diagnosis of an open defect is a HYPOTHESIS, not a finding. Make the instrument name the cause
before writing the fix — one extra field on the audit line turned a guess about estates into a
one-word answer, and the fix was four lines.

**9b. The household week has no lag.** (`PENDING`) `household-balance-sheet.ts` recorded what
households earned mid-week, reading the week's OWN settlement report — which at that point holds
the intraday pass only. **Every household flow the close and the funding cycle settled was
lost**: not double counted, not deferred, simply absent from the income the economy runs on. It
then parked the answer in three region fields for stage 02 to read the following week.

The lag is deleted rather than lengthened. Stage 02 reads the household week at the top of the
week from `ctx.priorWeekFlows.householdFlowsByRegion` — last week COMPLETE across all three
settlement cycles, which was already persisted and unused — and passes it to `evolveRegionMacro`
as `householdWeek`. The staleness is unchanged (it was already a week old by the time stage 02
consumed it), the data is whole, and `lastWeekHouseholdReceiptsUSD`, `lastWeekHouseholdTaxPaidUSD`
and `lastWeekHouseholdDividendsUSD` are retired (rule 2). Week 1 has no prior week and falls back
to the bootstrap identity exactly as before.

The measured income moves a long way, because the close settles a large share of it: weekly
household income USA 731.9B → 527.9B, EUR 283.7B → 503.6B, UK 235.8B → 194.4B, JPN 294.2B →
170.2B. The dispersion is the point — each region's close settles a different mix of receipts and
tax, and the intraday-only read had been flattening all four toward the same wrong shape.

Measured (SHOCKS=0 WEEKS=16): **131 in 32 → 138 in 35**, and **"the money that is not anyone's"
0.47B across 3 lines → 0.10B across 2**. The money family is what this step is about and it
improved: M5 (bank sheet closes, 2/16) and O3 (register rows name a live instrument, 2/16) went
CLEAN, M1 4/16 → 2/16, M7 3/16 → 1/16. The count rose because household income drives
consumption, consumption drives the goods auction, and the whole run re-paths: the +7 is P- and
X-family market-behaviour lines (rule 11 — not evaluated mid-project) plus one new money line.
Not rolled back (rule 13): the derivation is right and the print is a path.

**The new money line is a real finding and is now step 11d.** M6 fires once (week 8, UK) at 2.55B
unexplained. It CANNOT be mechanically caused by this change — M6's inputs are the settlement
report plus `householdBookDepositFlowWeeklyUSD` and `householdDepositInterestWeeklyUSD`, none of
which this step touches — so it is a pre-existing gap in M6's list of money creators that a large
cross-border week exposes (that week: cross-border +27.82B and banks' own account −21.25B against
a 0.36B move in the stock).

**1. The interest that is never paid.** (a, `5454934`) `trancheWeekAccrual` made CP due only in
its maturity week and the register's accrual loop skipped exactly that week, so **CP interest
accrued to holders from issue and was never once paid**, and every bond/loan whose term is a
whole number of periods lost its final coupon. The skip is gone from both sides
(`front-core.ts:561` the issuer's expense, `stage08-back.ts:1144` the holders' accrual) and,
because 07f retires matured CP before stage 08 runs, the coupon is marked due where the paper is
redeemed (`07f:782`). Measured (COUPON_TRACE=1, 16 weeks — a 13-week run CANNOT show this: CP is
issued in-run at +13 weeks, so the first maturity is w16): CP paid 0.000B for ever → **0.157B at
w16**, owed 0.286B → 0.141B instead of growing without bound; loans pay 7.807B at w13. One week's
accrual on maturing CP is missed on BOTH sides equally (the row is gone before stage 08) —
symmetric, and it closes when step 13 makes CP a discount instrument like the bills beside it.
(b, `8edb476`) `applyHolderInterestAccruals` split interest over the institutional register
alone; the dealer desks hold the same paper and their share was paid to the other holders. The
same hole ran through `pendingHolderCashUSD` — a call premium went entirely to the register and
an equity dividend paid the desks' shares to households as part of the float. A desk's position
is ISSUER-keyed where a register row names a tranche, so it now holds the issuer's stack in the
register's own proportions (and all of it where the register holds none), accrues on the same
nested ledger, and is paid at the same coupon date; a cash action's denominator is the register,
the desks and, for equity, the float. **A desk's receipt is INCOME** — cash on the securities
account, no paper out — so it goes through `bookPnL`; without that leg M5 lit up for six banks
over ten weeks in the first gate run, which is what named the missing write. Measured
(COUPON_TRACE=1 SHOCKS=0 WEEKS=16): **99 violations in 24 families → 95 in 24**, money clean,
unowned 0.00B; at w16 the desks accrue 0.078B of the week's 0.597B corporate-bond interest,
0.205B of 0.902B on loans, 0.015B of 0.023B on CP, and are owed 1.579B / 0.564B / 0.102B.
COUPON_TRACE now carries the desks' slice of accrued/paid/owed per type.

**2. The residual delivered twice.** (`9268624`) `primary-settlement.ts` moved the lead's
underwriting residual to its desk twice — a kind-dispatched movement (new shares issued onto the
lead for equity, a transfer off the clearing house for credit) followed by an unconditional
second transfer off the house with the identical spec. Both emit a wire, so the house was debited
twice for one delivery and the equity path attributed one movement to two senders. The second
block is gone. Measured (SHOCKS=0 WEEKS=16): **95 violations in 24 families → 95 in 24**, money
clean, unowned 0.00B. **The plan named this as the suspect behind the standing W2 dust and it is
not** — the whole effect is JPN CORP_BOND moving from −0.00B to 0.00B in weeks 15–16, under
0.005B. Most primaries are taken in full so the residual is small, and what the duplicate did
wire, `debitRow` silently truncated on the second pass. W2's dust has another owner; do not
re-derive this one.

**3. The silent truncations.** (`81b6efc`) Four paths moved less than they were told to and said
nothing. `holdings-ledger.debitRow` took `min(left, row)` per row and dropped the remainder,
while `transferHolding`/`retireHolding` had already WIRED the full quantity — paper minted on
the receiving side that never left the payer's book; it now defects, as `retireTranche` already
did. `holdings-store.addShares` returned with an undeliverable remainder while the receiving leg
is a separate call; it now defects. `pruneEmptyRows` kept a row only at `qtyUSD > 1` — a DOLLAR
test that destroyed SHARES — and now keeps any row holding anything in either unit. The store's
by-position pairing of book objects to persistent row ids is checked for length and instrument
where it is made, because `finalize` keeps and frees off it. The free paths now clear the row
they release, as the tranche store's does.
**The guards immediately named two live minting callers, and fixing them is rule 6's pairing:**
`etf-flows` struck the share count at the pre-flow NAV and valued the same shares at the
post-flow one, so the two legs of one transaction disagreed — paper now leaves a book at what
the book CARRIES it at, and the difference against the NAV the cash transacted at is the
holder's gain; `securities-lending` let a recalled borrower 0.0001 shares short deliver the
loan's full size, and now delivers what it holds. Both guards measure their residue RELATIVE to
the quantities the walk touched, because a row-by-row subtraction's leftover is float noise.
Measured (SHOCKS=0 WEEKS=16): **95 violations → 95**, money clean, unowned 0.00B, and sixteen
weeks now run with all four invariants asserted.

**4. The goods mint.** (`437f556`) `settleOutputInventory` wrote a seller's finished stock as
`max(0, held)` and booked the shortfall as `mintedUnits`: the wires said the goods had left, the
stock said they were never there, and the difference was created so the identity would still
close. A stock cannot be negative and no sale may make it one — the sale that oversold is now the
defect, named at the write site, with float noise on a sum of thousands of lots treated as zero.
`deliverGoods`'s `priceUSD: Math.max(0, unitPriceUSD)` turned a negative price into a free
delivery and defeated `wirePush`'s own guard; it defects. With the mint impossible `mintedUnits`
can never be non-zero, so the field, the **W4b check that read it** and its term in the goods
identity are deleted from the ledger, the wire journal, the state type and the audit; W4's real
identity check stands. **The rationing the plan asked for already existed** — contracts settle at
`min(owed, available)` and the open market is offered only what they left, which is why W4b never
fired; the clamp was latent, not absent. Measured (SHOCKS=0 WEEKS=16): **95 violations in 26
families → 95 in 26**, money clean, unowned 0.00B, every week count unmoved.

**5. The estate that never closes.** (`4bda75c`) Three things kept the close test false.
(i) `openEstate` wrote `assets.cashUSD` once and nothing decremented it while the other three
assets were re-read weekly, so any estate opened with cash could never close — cash is now the
account, re-read after the waterfall. (ii) The disposal sold a fixed SHARE of what was left each
week, so the tail halved for ever; both schedules now run from the week the estate opened and
the last week of each takes the remainder in one lot. (iii) `writeOffResidual` walks CLAIMS, and
a claim opens only above a dollar, so a smaller row survived the close and then named an
extinguished instrument; every row of the dead issuer now goes. Claims are on ONE BASIS, FACE,
and what the register claims of each tranche is checked against the ladder's own face for it.
**The burn-in probe gained `open estates`** and paid for itself at once: 41 open at week 16
against 6 defaults in the last week alone is what named (ii) and (iii). Measured (SHOCKS=0
WEEKS=16): **95 violations in 26 families → 92 in 25**; O3 (rows naming an instrument that does
not exist) and the goods-wedge X2 line are gone, money clean, unowned 0.00B, open estates 41 →
37 with the horizons now finite. The workout's 0.9-capped sale price and its pro-rata-to-cash
allocation are untouched — step 20's.

**6. Bank resolution transfers the whole sheet.** (`b1111d7`) `planBankResolution` netted the
failed bank's own BOND LADDER against the CENTRAL BANK's loan and transferred only the
remainder, while `assumeBankBooks` then zeroed the shell's balance outright — the un-assumed
part was erased with no counterparty while `loansToBanksUSD` still carried the asset, and two
different liabilities were treated as one line. The whole central-bank loan now moves with the
books, and the ladder is bailed in where it lives: on the shell's own rows, its holders taking
their loss through the estate like any other issuer's bondholders. `wholesaleHaircutUSD` was
identically zero, so the loss order it documented was dead code and its equity line bypassed
`bookPnL`; with the central bank whole by construction there is no wholesale lender to haircut,
so the field, the line and the news sentence quoting it are gone. Measured (SHOCKS=0 WEEKS=16):
**92 in 25, unchanged — no bank is resolved in the reference run**, so this one is verified by
the pure-function tests (rewritten to the new shape) and by reading, not by the run.

**7. The treasury's own books.** (`e3f598a`) (i) `Government.interestWeeklyUSD()` returned the
coupon PLUS the bills' discount accrual, which `government.ts` states in terms is the double
count — bills are ~21% of the stack, stage 11 always used the coupon alone, and the inflated
figure is what the fiscal red line tests a region against. The accrual term is gone. (ii) **The
reverse repo window is now a real position.** It paid the administered rate on a balance booked
nowhere, so the same dollar earned the floor and stayed spendable; the money-market session now
decides the size, a `reverse-repo-draw` stage takes it at the close — before the settlement and
funding closes, so banks losing the deposits can square up — and the next session returns it with
interest at the rate it was struck at. The central bank carries `reverseRepoBorrowedUSD` (M1
counts it), the institution carries `rrpLentUSD` (in its book, not its purchase capacity), and
every reader of `repoLentUSD` reads it too. (iii) The LOLR's raise and repay read ONE buffer:
the draw was sized against 2% of household deposits while the repayment released cash only above
the LCR's HQLA requirement — which the sovereign book also satisfies — so the loan ratcheted and
was never repaid. Measured (SHOCKS=0 WEEKS=16): **92 violations in 25 families → 107 in 29**,
money clean, unowned 0.00B, no fund overdrawn. **The rise is named:** the non-banks' idle cash
genuinely leaves the banking system now, so bank NIM compresses (X1 4/16 → 9/16 weeks, a EUR
NIM-out-of-band line appears) and the credit books clear on smaller budgets. That drain is the
correction of a real double count — the same deposits were counted as parked at the central bank
AND available in the banking system — and its SIZE is decided by `CASH_SLEEVE_OVERNIGHT_SHARE =
0.5`, now step 30b. P1's breaching issuers fell 1096 → 815 on the way.

**8. The register's remaining holes.** (`31755c9`) Eight sites where a claim, a price or a
residual had no owner. `12-portfolio`'s IRS/CDS/XCS maturities added the same P&L to both the
realized-P&L and realized-cash lines and stage 13 sums both into cash — paid twice; the corp and
sov branches had already been converted and say why. `etf-flows` floored every participant's
target at what it held, so no holder could sell and the print was pinned at the reservation
whenever AP capacity was short. `dealer-desks` charged a negative session residual to equity as a
"fee" and discarded a positive one; the residual is the desk's trading result and is booked
signed. The beneficiary claim was set once and kept for every kind but pensions, so an insurer's,
asset manager's and hedge fund's household claim was frozen at week 1 — it now grows by the
week's measured investment income in ONE place, and that income no longer keeps last week's
number in a week with none. `holdings-view` set sector EQUITY to total ASSETS (A = L + E with the
liabilities left out) and counted overnight cash lent inside sector CASH while it sits in the
borrower's; both fixed. `householdDirectEquityUSD` subtracted only the register from market cap,
counting the banks' whole equity desk book as household net worth while 07e computed the same
residual with the desks out. `pe-lifecycle` wrote a flat 70% sponsor stake on an IPO and dropped
the company from the fund's portfolio, so the retained stake left the sponsor's assets with no
sale and, unregistered, was credited to households; the sponsor now keeps what it did not sell as
real shares and its percentage is a read of them. Measured (SHOCKS=0 WEEKS=16): **107 in 29 →
108 in 27**, money clean, unowned 0.00B — flat, with eight holes closed.

**9. One running settlement net.** (`35fa0ea`) `pendingSettlementUSD` — read by repo's surplus,
every bid sizer, the prime-brokerage sweep and the close sweep — was short for two independent
reasons, and a second representation had been written to work around the first. `journalPayment`
wrote the journal and nothing else, so every coupon, dividend, call premium and redemption the
paying agent made existed to no budget until it settled; it now updates the net like `pay`. A
DATED ROW never joined the net even in its due week — `pay` skips it when recorded, correctly,
and nothing added it when its week arrived — so a corporate tax obligation was invisible on the
week it is paid; the net is seeded from the carried journal when the week's context is built.
With both closed the close sweep stops re-deriving the net by walking the journal and reads the
one total. `sme-pools` read the week's own report (the intraday pass only), losing every pool
flow the close and funding cycles settle; the complete week is now persisted and it reads the
prior one whole. **The household stage has the same hole and deliberately does not get the same
fix** — its fields are a one-week lag consumed the week after, so the prior week makes them two
weeks stale and breaks M6 — now step 9b. Measured (SHOCKS=0 WEEKS=16): **108 in 27 → 115 in
33**, unowned 0.00B, M1/M2/M4/M5/M7 clean, **M6 grazing its band in 1 of 16 weeks** (2.69B
against ~2.5B): a threshold crossing on a week whose flows moved, and the first thing to bisect
when step 27 gives M6 a real band.

**10. Both legs, same money, same counterparty.** (`8daa2ba`) A household's, a treasury's or a
segment pool's goods move lot by lot with the seller that sold them, while the CASH was spread
across every seller in the book pro rata — so a household paid sellers it never bought from, and
its own bill was a residual (the book's total less what firms and segments paid) rather than what
its fills cost, with any disagreement smeared across the sellers. Both legs now walk the same
lots and the residual arithmetic is gone. A SELLER'S REVENUE IS WHAT ITS BUYERS PAID IT: a
cross-border buyer pays in its money while the seller booked the auction's origin-money value, so
statement and account differed by the rate; revenue is now accumulated from the payment legs, the
discipline the freight leg already states. FDI capitalised a foreign subsidiary with no
conversion at all — the two sides in different money, compared raw — and now converts, as its own
header always claimed. Stock-loan collateral is RE-MARKED weekly: struck once and never touched,
there was no variation margin, a squeeze cost nobody anything and `stockLoanNetUSD` was
unfunded. Measured (SHOCKS=0 WEEKS=16): **115 in 33 → 110 in 33**, unowned 0.00B; P2 6/16 → 3/16
weeks, P3 (rating) 16/16 → 14/16, and M6's graze 2.69B → 2.42B.

**11. The wild swings, by named cause.** (`56dc3ee`) (a) **A firm's size scales whole.** All three
resize sites — the padding clone, the thinning lift, the sector normalisation — scaled revenue,
shares, plant, ladder and cash but left the INCOME STATEMENT alone, so a clone at 30% of its
parent carried 100% of its EBITDA (margin above one) and 0.3× its leverage. One helper now scales
every size-proportional line at all three; eps and the margin ratios are left alone because two
scaled lines make an invariant. (b) **A bank is rated on a continuum**: leverage was `revenue ×
0.4` and coverage took exactly TWO VALUES either side of a 5% capital ratio. Now debt against
equity, and years of its own expected losses its capital absorbs. Measured against the buffer
above the regulatory floor first — the default probability's construction — it went NEGATIVE for
a thin but solvent bank and rated it below a corporate with no earnings; on a ladder shared with
corporates the whole capital base is the right base. A test pins the continuum. (c) An empty
index membership returned the BASE LEVEL where callers multiply a fractional change (×1001 in one
week); it now reports no move. (d) **The fabricated CPI year is gone** — 53 weeks compounding at
the target, feeding the Taylor rule, the labour deflator and the news as measurement. History
begins where the world does; until 53 real weeks exist `inflationIsMeasured` is false and the
LEVEL is reported.
Two of my own guards fired and both were right: the debit guard's tolerance was keyed to the spec
rather than the position walked (addReserves' lesson, §9.3), and with that fixed it named
`keepsRow`'s $1 threshold dropping rows of OTHER instruments during a relink — one predicate now,
the same one `pruneEmptyRows` uses, and the ETF basket takes one slice per instrument rather than
per row. Measured (SHOCKS=0 WEEKS=16): **110 in 33 → 134 in 31**. The driver is (a) and it is the
truth the unscaled EBITDA hid — open estates 41 → 77, active firms 2461 → 2427 — and the A/B came
free: the harsher bank coverage gave 79 open estates against 77, so (b) is not the driver. The
deaths expose steps 11b and 11c, both now sized rather than asserted.

**12. Carriers, and the fuel nobody sells.** (`aac7a6e`) `totalDebt` stopped being a field when
the ladder became authoritative, so a carrier seeded with `totalDebt: debtBase` and an EMPTY
ladder opened with NO debt — while its seeded interest, coverage, leverage, rating, net income,
eps and share price were all struck against that debt and no lender held a dollar of it. It now
gets a real ladder from the same generator every other seeded firm uses. And a carrier sells
nothing in the goods book, so it had no input basket and its fuel was expensed off a physics
formula against a purchase that never happened: the world fleet's bunker demand never reached
`refined_products`. Moving goods IS `facilities_and_logistics`, and the registry already states
what a dollar of it consumes — that recipe is now the carrier's basket, no new stated constant,
and the profile's separate fuel charge goes with it. The physics stays as a measurement
(`lastWeekFuelBurnedTonnes`), which is what a bunker bid should eventually be sized from rather
than a share of revenue. Measured (SHOCKS=0 WEEKS=16): **134 in 31 → 131 in 32**, money family
unchanged in kind; O5's consignments 207 → 132.

---

**PART I is closed except 11b and 11c**, the two leaks the doubled death rate exposed. Everything
else in the closed circuit — the interest that was never paid, the residual wired twice, the
silent truncations, the goods mint, the estate that never closed, bank resolution, the treasury's
books, the register's holes, the settlement net, both legs of every trade, the wild swings and
the carriers — is done and recorded above.

**11b (part). The dead firm's money, and half its goods.** (`bf2ecf9`) M7 reported a COUNT of
settled rows whose party the account store has no row for — a hole with no size and no name. Step
11 gave it a size; this gave it a NAME, and the name found the cause in one run: every unmapped
row was `payee BANK_SECURITIES`. **A resolved bank's desk keeps its unpaid coupons** — the dealer
books merge into the acquirer but what that paper had already earned sat on the accrual ledger
under the failed bank's own desk id, so the coupon date paid a desk whose bank has no account and
the settlement store dropped both legs. Re-keyed now in `rekeyBankLinks`, where every other link
to a failed bank already is. **Both ends of a shipment follow the books**: a merger re-keyed the
BUYER and left the SELLER, and an estate swept only what was on its way TO the dead firm. Measured
(SHOCKS=0 WEEKS=16): 131 in 32, unchanged in total; **M7 30 rows → 5** (0.00B either way) and O3's
dangling rows 6 → 4. O5's 132 consignments survive both fixes and keep step 11b open.
