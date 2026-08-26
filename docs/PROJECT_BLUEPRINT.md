# Project Blueprint — Government, Regulation & Industry Structure

> Status: **Not started.** Queued after the "1$ is 1$" project (see `docs/ONE_DOLLAR_PROJECT.md`).
> Theme: the rules of the game — who governs, who competes, and how industries actually
> differ from each other — made real and structural instead of implicit or uniform.

## Why this bucket exists

The first two buckets (Main Street, Wall Street) make the *participants* in the economy real.
Blueprint makes the *environment they operate in* real: a government that actually taxes and
spends against real counterparties, regulatory power that can actually constrain a company
that gets too big, and an industry taxonomy that isn't a flat, interchangeable set of buckets
sharing one generic behavior model.

## Constituent ideas

### 1. Government as a real fiscal counterparty
Real tax collection from the actual simulated companies and households (once Main Street's
households exist) funding real government spending — closing the loop with the
already-partially-real government demand-side bids that exist in `05-unit-bidding.ts`
(`govShare`/government aggregate bids). Today government spending/revenue is largely a macro
parameter (`governmentSpendingUSD`, `fiscalStanceScore`); this makes it the sum of real,
traceable receipts and real, traceable outlays.

### 2. Regulatory action: antitrust + M&A freeze (backlog #45)
If a company accumulates too much competitive power (market share concentration, e.g. via
`categoryMarketShare`), a regulator can force a breakup or impose a temporary freeze on further
M&A — a realistic mechanism to keep monopoly power in check, using data (market share,
concentration) the sim already tracks.

### 3. More detailed simulation of the non-publicly-traded (hidden) sector (backlog #48)
The public corporate sector is now richly simulated (especially post "1$ is 1$"); the private/
hidden sector is currently a generic aggregate segment (`PrivateSectorSegment`) that supplies
and buys in bulk. This gives it more internal realism — closer in spirit to the public sector's
per-company detail, without necessarily naming every private company individually.

### 4. Modular, extensible industry/product taxonomy (backlog #50)
Make the number of industries and products modular and easy to add to. Today
`INDUSTRY_SUBUNITS` and related tables touch a large number of files whenever a category is
added; this is an architecture project to make that a low-friction, well-contained extension
point instead of a shotgun-surgery change.

### 5. Industry-specific behavior and capital-allocation profiles (backlog #51)
Specialize each industry's behavior, not just its output category: high-capex industries vs.
asset-light ones, regulated industries, cyclical vs. defensive industries, each with different
capital-allocation tendencies (buyback/dividend/reinvestment mix), sensitivity to demand
shocks, and financing preferences. Depends on idea 4 existing first, or at least being underway,
so specialization doesn't get bolted onto a taxonomy that's about to be restructured.

### 6. Real electricity costs (backlog #54)
Add a real electricity cost line to the corporate cost structure — a genuine input commodity
(price discovered like any other input, per "1$ is 1$") rather than an implicit component of
generic COGS pressure. Natural fit as an additional recipe-input category once idea 5's
industry specialization is in place (some industries are far more electricity-intensive than
others).

### 7. Market-share-vs-margin decision (backlog #55)
Give companies a real strategic choice between defending/growing market share (competing on
price, margin compression) versus protecting margins (ceding share) — a decision surface that
naturally builds on idea 5's industry profiles (some industries reward share, others reward
margin).

## Suggested sequencing
1. Modular industry taxonomy (idea 4) — do this first since ideas 5, 6, 7 all build on top of
   whatever industry structure exists, and retrofitting specialization onto a taxonomy that
   later gets refactored is wasted work.
2. Industry-specific behavior/capital-allocation profiles (idea 5)
3. Real electricity costs (idea 6) and market-share-vs-margin (idea 7) — can run in parallel,
   both consume idea 5's per-industry profiles.
4. Government as real fiscal counterparty (idea 1) — independent of 1-3, can be done any time
   (soft dependency: richer once Main Street households exist).
5. Antitrust/M&A regulation (idea 2) — independent, but most meaningful once idea 5 gives
   industries real differentiated competitive dynamics to regulate.
6. Non-public sector detail (idea 3) — lowest urgency; benefits from whatever taxonomy/industry
   work above nails down, since the private sector uses the same category definitions.

## Source
- New idea (1) proposed 2026-08-26 in response to "3 big revolutionary projects" discussion.
- Backlog tasks #45, #48, #50, #51, #54, #55 folded in as constituent ideas 2, 3, 4, 5, 6, 7.
