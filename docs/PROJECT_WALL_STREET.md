# Project Wall Street — Banking, Capital Markets & Money

> Status: **In progress.** Started immediately after "1$ is 1$" (see `docs/ONE_DOLLAR_PROJECT.md`,
> now at rest). This doc is the living design/status record for Wall Street, the same role
> `ONE_DOLLAR_PROJECT.md` played for the goods-side project.
> Theme: every loan, every deposit, every repo, every share of a money market fund clears against
> a real, named counterparty — a specific bank, a specific fund, another region's market — never
> an abstract formula or a single regional aggregate standing in for an entire sector.

## Why this bucket exists

"1$ is 1$" traced real-economy dollars (goods, capex, wages) to real counterparties. Wall Street
does the same for *financial* dollars. Today: debt is priced off an abstract yield curve; equity
issuance doesn't really exist as a market transaction; the entire banking sector of a region is
ONE aggregate object (`reg.bankingSector`) that four named "bank" companies merely slice
proportionally for stock-pricing purposes, with no real distinct balance sheet of their own;
there is no repo market, no money market fund, no commercial paper, and no short-dated government
debt; and monetary policy is a global dial (`policyRate`) every formula reads directly rather
than something transmitted through real central-bank operations. This bucket makes the financial
system as real as the corporate one now is.

## Confirmed starting state (audited before writing this plan)

- `BankingSector` (`domain/banking.ts`) is a single aggregate per region — one loan book, one
  deposit base, one capital ratio, one central-bank-reserves figure for the whole region.
  `BankDeepDive.tsx` literally labels it "{region} Systemic Banking Sector," not any one bank.
- Four named `Company` entities per region carry `isBankEntity`/`bankMarketShare`, but that share
  only slices the ONE aggregate's equity for their own stock price — they have no real loan book,
  deposits, or capital ratio of their own. This is the same "two disconnected representations of
  the same real thing" pattern the commodities-linkage fix found and fixed on the goods side.
  Fixing it here is Phase 1.
- `InstitutionalEntityType` (`domain/institutions.ts`) is `'INSURER' | 'ASSET_MANAGER' |
  'PENSION_FUND'` — a clean, already-proven extension point for a fourth type,
  `'MONEY_MARKET_FUND'`.
- There is no repo market, no commercial paper, no money market fund, and no short-dated
  (sub-1-year) government debt anywhere in the codebase today — confirmed by search. Government
  debt (`GOV_DEBT_TENOR_WEIGHTS`, `11-fiscal-and-sovereign-debt.ts`) only goes down to a 2-year
  tenor. All of this is new construction, not a fix to something existing.
- Task #67 (USA bank capital ratio collapsing to exactly 0.0000 over long horizons, confirmed
  pre-existing) sits in the exact subsystem Phase 1 rebuilds. Diversifying the banking sector into
  real, individually-failable banks is likely to change — and should be revisited alongside —
  that bug's dynamics: a single struggling bank can fail or get recapitalized without the whole
  region's capital ratio being dragged to zero as one monolithic number.

## Known bug investigation: initial instability + bond pricing (landed: rating-lag fix; root cause of decay identified)

User-reported via screenshots (a company, `KBTK`/Omni Brands, Consumer/USA): revenue/EPS/stock
price decay over the first weeks of a run, and a credit-pricing disconnect — the company rated
**A** with a bond-implied spread (OAS) pinned at the **5000bps** ceiling, a level that in reality
implies deep distress, not an A rating. Traced both:

**Rating/OAS disconnect — real bug found and fixed.** `newRating` only updated to match a
company's freshly-computed leverage/coverage-implied rating with a 25%-per-week stochastic chance
— deliberately sticky, mirroring how real rating agencies don't instantly re-rate every week. But
`computeExpectedLossSpreadBps` (which sets the bond spread) reacts to the company's real
leverage/coverage every week with **no such lag** — so a company whose fundamentals genuinely
deteriorated fast could sit at a stale investment-grade rating for dozens of weeks while its own
spread already priced default risk. Real rating agencies don't let this persist either — a severe
or investment-grade/high-yield-crossing gap triggers a real "fallen angel" cliff downgrade, not
another coin flip. Fixed in `08-company-fundamentals.ts`: a rating update is now forced
immediately (bypassing the 25% gate) once the gap between the stale rating and the real,
freshly-calculated one is 2+ notches or crosses the IG/HY line; ordinary single-notch drift keeps
the original stochastic lag. Verified via `tsc`, hygiene, and a 60-week revenue-ratio diagnostic.

**Cold-start revenue decay — root cause identified, traces back to an already-tracked issue, not
a new bug.** Traced a sample Consumer company week-by-week: its real settled sales (from stage05's
auction) actually stabilize at a healthy level (~$9-11B annualized) within the first ~5 weeks —
the auction itself is fine. But `targetProductionUSD` (the figure `unsoldThisWeekUSD`'s shortfall
penalty compares real sales against) is defined as `update?._targetProductionUSD ?? newRevenue/52`
— an echo of the *previous week's own revenue*, not an independent real target — so a company
seeded with revenue somewhat above what its real category-demand share supports grinds itself down
via its own shortfall penalty until the two converge, a real but self-correcting adjustment. The
sample company's much larger, longer decline (72% by week 15) is consistent with it carrying a
`passenger_vehicles` line requiring real recipe inputs (`upstream_extraction`/`specialty_metals`
via `AutomotiveTransport`'s `CATEGORY_INPUT_REQUIREMENTS`) — subject to the auction-fairness
residual already tracked under task #18/#49's continuation (companies that lose real input-
fulfillment auctions have no fast recovery path) — not a newly-discovered class of bug. Genuinely
resolving the compounded severity for input-dependent companies requires the same deeper fix
already tracked there, not a quick patch here.

## Phase 1 landed: diversified banking sector

Each region's 4 real `isBankEntity` companies now carry their own `bankBalanceSheet` (loan book,
deposits, capital ratio, CB reserves) and a persistent `bankRiskFactor`, evolved independently in
a new stage (`02b-bank-diversification.ts`, runs after region-macro, before company-fundamentals)
— `reg.bankingSector` is now a real sum/weighted-average of these named banks, not the sole source
of truth they used to merely slice proportionally. Bank stock pricing in `08-company-fundamentals.
ts` now reads each bank's own real equity. `BankDeepDive.tsx` shows a new "Individual Banks" panel
alongside the (now genuinely-derived) regional aggregate.

**Real bug found and fixed while landing this**: the existing roster-padding step (which clones
random companies to fill each region out to 200 names) was cloning bank AND institutional-entity
companies too, copying their `bankMarketShare`/`institutionalMarketShare`/`bankBalanceSheet`
verbatim without scaling — so a region ended up with far more "banks" than the intended 4, each
duplicating (not diversifying) a real bank's exact figures, inflating the real aggregate ~4x.
Fixed by excluding bank/institutional entities from the padding clone-parent pool entirely (their
counts are deliberately exact, unlike generic sector companies padded for roster depth) — this
incidentally fixes the identical latent bug for `institutionalMarketShare`, not just banks.

Verified via `tsc`, hygiene, a 220-week per-bank trace, and a 60-week revenue-ratio diagnostic.
The per-bank trace confirms genuine, risk-ordered divergence: the highest-`bankRiskFactor` bank
fails first (capital ratio hits 0 around week 100), each successively lower-risk bank follows a
few weeks later, rather than all four hitting zero in lockstep as the single pre-existing
aggregate did — real progress on the spirit of task #67 even though the underlying collapse
mechanism itself (still pending root-cause) isn't fixed by this phase. Revenue-ratio diagnostic:
10 violations at week 60 (avgRatio 0.735, one company briefly dipping below threshold) — within
the noise band established across every phase this session, not a new regression.

## Phase 2 landed: central bank reserve facilities (SRF / ON RRP)

Added real Standing Repo Facility and overnight reverse repo facility mechanics in
`02b-bank-diversification.ts`'s new `applyCentralBankFacilities`: a bank whose real cash falls
below a target buffer (2% of deposits) borrows the shortfall from the SRF at `policyRate +
25bps`, a real weekly interest cost against its own equity; a bank with cash above a target
ceiling (15% of deposits) places the excess at the ON RRP, earning `policyRate - 20bps`. Both
rates are deliberately **administered** (posted by the central bank), not auction-cleared —
matching how the real Fed's SRF/ON RRP actually work (a fixed posted rate, real quantity
response), not a formula standing in for a missing market. Each bank's own `srfBorrowingUSD`/
`onRrpLendingUSD` are real, tracked figures (added to `BankingSector`), summed into the region
aggregate, and shown per-bank in `BankDeepDive.tsx`.

Verified via `tsc`, hygiene, a 30-week facility-usage trace (correctly inactive under normal
conditions — real usage should be rare, not constant), a stress-period trace through the
pre-existing bank-capital collapse (task #67) confirming ON RRP usage correctly activates once a
capital-constrained bank can no longer lend out incoming deposits (a real mechanical consequence,
not a new bug — surfaces a genuine gap for later: no deposit-flight mechanism exists for an
insolvent bank, part of why the zombie state persists), and a 60-week revenue-ratio diagnostic (1
violation, avgRatio 0.740).

## Foundational correction: every asset's price must be a real supply/demand clearing outcome

User directive, stated explicitly and repeated for emphasis: **the price of every single asset —
equity, corporate bonds, sovereign bonds, loans — must be the actual result of a real supply/demand
clearing, not a formula.** OAS/discount margin are descriptive statistics computed *from* a cleared
price, not the mechanism that sets it. This elevates idea 6 (below) from "a design principle for
the new markets in Phases 3-5" to the foundational, retroactive requirement for the entire project
— including the pricing that already exists today (Nelson-Siegel yield curves,
`computeExpectedLossSpreadBps`'s PD-based OAS formula, `priceLeveragedLoan`'s formula, equity's
holder-class-flow price move) needs to be reworked to run through a real, generalized bid/offer
clearing engine for financial assets, mirroring the goods-side auction (`05-unit-bidding.ts`) that
"1$ is 1$" already proved out. **The one confirmed exception**: central bank facility rates (SRF/
ON RRP, Phase 2 above) are legitimately *administered* — posted by the central bank, with real
quantity response, not a two-sided auction — matching how they work in reality; this is not in
tension with the directive, since the central bank posting a rate and other participants clearing
against each other around it are different, both-real mechanisms.

This changes the practical sequencing of everything below: before continuing further into Phases
3-5 (repo, short-dated debt, MMFs) with fresh formula-based pricing, first build the generalized
financial-asset clearing engine and retrofit existing equity/bond/loan pricing through it, so
every new phase is built on the real mechanism from day one rather than adding more to retrofit
later.

## Constituent ideas (full scope)

### 1. Diversified banking sector (new — foundation for everything else)
Break `reg.bankingSector`'s one aggregate balance sheet into real, individually-tracked banks —
the four `isBankEntity` companies each region already generates, upgraded from a stock-pricing
label into an entity with its own loan book, deposit base, capital ratio, and central-bank
reserve account. A bank's capital shortfall, funding stress, or failure becomes a real, named
event (this specific bank), with contagion to its real counterparties (borrowers whose credit
line was with it, depositors, repo counterparties) — not a regional statistic. Region-level
figures (total credit conditions, aggregate M2) become real sums over these named banks instead
of the sole source of truth.

### 2. Central bank reserves + repo facilities (new)
Real central-bank operations instead of `policyRate` as a globally-read parameter:
- **Reserve accounts**: named banks hold reserves at the central bank (real balances, not an
  aggregate). Per the user's explicit ask, reserve access isn't bank-exclusive — certain non-bank
  entities (money market funds, see idea 4) can access specific CB facilities without a full
  reserve account, mirroring how real central banks extend RRP access to MMFs/GSEs.
- **Standing Repo Facility (SRF)**: named banks can borrow cash from the central bank overnight
  against high-quality collateral (government bonds) at a real, posted rate — a real backstop,
  not an invented "emergency injection" formula.
- **Reverse repo facility (ON RRP)**: money market funds and banks can lend cash *to* the central
  bank overnight against its collateral, absorbing excess liquidity — the real mechanism that
  puts a floor under short-term rates in reality.
- `policyRate` becomes the rate the central bank sets on these facilities, not a number every
  unrelated formula reads directly — the transmission is real (who actually used which facility,
  how much) rather than assumed.

### 3. Repo markets (new)
Real repurchase agreements between named counterparties (banks, money market funds, dealers):
cash lent short-term against government-bond collateral at a real repo rate, unwound at maturity.
This is the actual plumbing of short-term money markets in reality and is the primary real asset
a money market fund (idea 4) holds day to day, alongside the CB's reverse repo facility (idea 2).

### 4. Money market funds (new)
A fourth `InstitutionalEntityType`. Raises real demand deposits/shares from BOTH corporates
(cash-management sweep of excess operating cash) and households (a real savings alternative to
bank deposits) — the explicit "source of true demand for short high-quality paper" the user
asked for. Invests almost entirely in: government short-dated bills (new — see idea 5), real repo
(idea 3), and commercial paper (new — see idea 5). Competes on yield the way real MMFs do; a
corporate treasurer or household choosing an MMF over a bank deposit is a real, modeled decision,
not an assumption.

### 5. Short-dated debt markets: T-bills and commercial paper (new, prerequisite for idea 4)
Money market funds need real short-duration paper to hold. Two new instruments:
- **Government short-dated bills** (sub-1-year, extending `GOV_DEBT_TENOR_WEIGHTS`'s shortest
  existing tenor of 2 years downward) — real government financing needs met by a real short-end
  buyer base (MMFs foremost), not folded into the existing longer-tenor ladder.
- **Commercial paper**: short-term unsecured corporate debt, the short-duration sibling of the
  long-term bond issuance in idea 7 — a company's real near-term financing need (working capital,
  bridge funding) met by a real buyer (MMFs), priced at a real market-clearing spread over the
  risk-free short rate reflecting that company's own credit quality.

### 6. Real, hittable bid/ask markets for financial assets (new — a cross-cutting execution layer)
The same real double-auction mechanic "1$ is 1$" built for goods (named participants post real
bids/offers, a real clearing price emerges, pro-rata allocation) generalizes to repo, commercial
paper, and short-dated bills: actual demand-driven quotes any real participant can post or hit,
rather than a formula that outputs one already-cleared price. This isn't a separate phase so much
as a design requirement for how ideas 2/3/5 get built — construct their markets as real bid/offer
books from the start, not a price formula with a market bolted on after.

### 7. Realistic corporate debt/equity issuance with bank placement agents (backlog #46)
Companies issue new long-term debt or new equity to fund expansion, M&A, refinancing, or general
corporate purposes. One or more banks act as placement agents, finding the clearing spread (debt)
or clearing price (equity — fixed share count, price discovered via real demand) to place the
issuance, earning a fee. The commercial-paper issuance in idea 5 is this same mechanism's
short-duration counterpart; likely share a placement-agent implementation.

### 8. Deeper, more realistic institutional sector (backlog #47)
Asset managers raise AUM from someone and compete on fees rather than an ambient number. Pension
funds are non-profit but grow AUM from a real slice of pre-tax wages (see Main Street idea 1 for
the household side of that flow), later drawn down by pensioners, needing real actuarial/
insurance modeling both households and corporates can use. Money market funds (idea 4) are a
sibling addition to this same institutional layer, not a replacement for this item.

### 9. Corporate hedging (backlog #53)
Companies hedge FX, rate, or commodity-input exposure where relevant — real derivative-like
positions against a real counterparty (a bank or dealer), not an automatic smoothing formula.

### 10. Real international trade and FX
If regions represent distinct currencies, cross-region flows become literal export/import
transactions with an FX rate emerging from real currency demand, converted by a real bank or FX
market — not an assumed peg. **Caveat, unchanged from the original scoping: only relevant if
regions are meant to be distinct currency zones — confirm the premise before starting; skip
entirely if all regions share one currency.**

### 11. Hedge funds as real marginal demand for distressed/non-performing debt (new)
A new institutional participant type — not a passive allocator like idea 8's asset managers, but
an active, analysis-driven buyer of a specific named company's distressed paper. When a company
is genuinely weak but has a real, identifiable path to recovery (the kind of company a distressed-
debt/special-situations fund actually targets in reality), a named hedge fund entity places a real
bid for that company's debt, equity, and/or CDS — the real marginal buyer for assets everyone else
is exiting, giving non-performing debt an actual clearing price and a real path back into
circulation instead of sitting unpriced/unbid. Needs idea 6's real hittable bid/ask markets to
have somewhere to actually place that bid, and pairs naturally with idea 9 (hedging) since a fund
buying distressed debt is itself taking on real credit risk it may choose to hedge.

### 12. Banks hedge their own derivative counterparty exposure (new)
When a bank is the counterparty to a real derivative position (a company's rate/FX/commodity
hedge from idea 9, a hedge fund's CDS position from idea 11), the bank itself carries real
resulting exposure — it shouldn't be left as an unhedged, invisible risk sitting on the bank's own
book. The bank should lay off (hedge) that exposure itself, the way a real dealer bank actually
manages its book — a direct extension of idea 1's real per-bank balance sheets (this is exactly
the kind of position a bank's own capital ratio should feel the effect of) and a natural
companion to idea 9's corporate hedging and idea 11's hedge-fund CDS activity.

## Target implementation scheme (sequencing and dependencies)

Ideas 1-6 are new construction and form the actual "Wall Street" money-markets buildout the user
asked for when starting this project; ideas 7-10 are the original three ideas from this bucket's
first scoping pass, folded in at the point they naturally connect; ideas 11-12 (hedge funds as
distressed-debt demand, banks hedging their own derivative exposure) were added once Phase 1 was
already underway, alongside the known cold-start/bond-pricing bug reported above.

1. **Phase 1 — Diversified banking sector.** Foundation for everything else: gives idea 2's CB
   facilities, idea 3's repo, and idea 4's MMFs real named bank counterparties to interact with,
   instead of one aggregate. Touches: `domain/banking.ts` (per-bank balance sheet type),
   `macro/banking.ts` (per-bank evolution instead of one aggregate), the 4 `isBankEntity`
   companies (real balance sheet instead of a stock-pricing label), `BankDeepDive.tsx` (per-bank
   drill-down), region-level aggregates (become real sums). Natural point to revisit task #67.
2. **Phase 2 — Central bank reserves + repo facilities (SRF / ON RRP).** Needs Phase 1's named
   banks to exist as real facility counterparties. Establishes the real policy-rate transmission
   mechanism idea 3's private repo market and idea 4's MMFs both anchor to.
3. **Phase 3 — Private repo markets.** Needs Phase 1 (real banks) and benefits from Phase 2 (a
   real anchor rate) existing first. Built as a real bid/offer market per idea 6.
4. **Phase 4 — Short-dated debt: T-bills + commercial paper.** Needs Phase 3's repo/auction
   machinery patterns; commercial paper issuance likely shares implementation with idea 7's
   longer-term issuance (build together or sequence immediately adjacent).
5. **Phase 5 — Money market funds.** Needs Phases 2-4 (repo, CB facilities, short-dated paper) to
   have real assets to hold. This is the phase that delivers the user's core ask: real demand for
   short HQ paper from a real, named institutional buyer.
6. **Phase 6 — Corporate debt/equity issuance with bank placement agents (idea 7 / backlog #46).**
   Can start once Phase 1's real banks exist to act as placement agents; naturally follows or runs
   alongside Phase 4's commercial paper (same mechanism, different tenor).
7. **Phase 7 — Deeper institutional sector (idea 8 / backlog #47).** Asset managers/pension funds,
   independent of Phases 1-6 but conceptually a sibling to the Phase 5 MMF work.
8. **Phase 8 — Corporate hedging (idea 9 / backlog #53).** Needs a real bank/dealer counterparty
   (Phase 1) to hedge against.
9. **Phase 9 — International trade & FX (idea 10 / backlog #63).** Independent; confirm the
   currency-zone premise before starting.
10. **Phase 10 — Hedge funds as distressed-debt demand (idea 11).** Needs idea 6's real hittable
    markets to exist as somewhere to place the bid; benefits from Phase 1's real per-bank/company
    credit data to identify genuinely-recoverable distressed names.
11. **Phase 11 — Banks hedge their own derivative counterparty exposure (idea 12).** Needs Phase 1
    (real per-bank balance sheets to feel the effect on) and idea 9/11's real derivative positions
    to exist as the exposure being hedged.

**Investigate alongside Phase 1** (not a separate phase — the same subsystem): the reported
cold-start revenue/price decay and the credit-rating/OAS-spread disconnect (5000bps spread on an
A-rated company) — see "Known bug" section above.

## Source
- Original scoping (ideas 7/8/9/10 here, then numbered 1/2/3 in the first pass): proposed
  2026-08-26 in response to "3 big revolutionary projects" / "3 more" discussion; backlog #46,
  #47, #53 folded in.
- Ideas 1-6 (diversified banking, CB reserves/repo facilities, private repo, money market funds,
  short-dated debt, real hittable bid/ask markets): user's explicit expanded scope, given when
  instructing Wall Street to start immediately after "1$ is 1$."
- Ideas 11-12 (hedge funds as distressed-debt demand, banks hedging derivative counterparty
  exposure) and the cold-start/bond-pricing bug report: user feedback while Phase 1 was already
  underway, given via screenshots of a sample company showing early-run revenue/price decay and a
  5000bps OAS spread on an A-rated name.
