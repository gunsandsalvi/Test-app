# Project Main Street — People, Labor & the Wage Economy

> Status: **Not started.** Queued after the "1$ is 1$" project (see `docs/ONE_DOLLAR_PROJECT.md`).
> Theme: every household is a real, named agent with a real job at a real company, not a macro blob.

## Why this bucket exists

The "1$ is 1$" project made every corporate dollar traceable to a real counterparty on the
*corporate* side (another company, government, or the private sector). Main Street is the
household-side mirror of that same philosophy: every wage dollar, every job, every benefit
check should trace back to a real employer or a real government program — not a synthetic
`estimatedHouseholdIncomeUSD` aggregate that companies pay into and households draw out of
with no individual identity on either end.

## Constituent ideas

### 1. Households as real, named economic agents
Currently households are one region-level macro object (`reg.householdState`). This replaces
(or augments) that with named household units/cohorts that each hold a job, earn a wage, pay
taxes, save, and consume — so `estimatedHouseholdIncomeUSD` becomes the *sum* of real payroll
paid by real companies, not an independently-simulated number. This is the anchor idea for the
whole bucket; the other two ideas below are largely mechanisms this one needs.

### 2. Real labor market with named workers/cohorts
Companies currently adjust `employeeCount` as a scalar and wage pressure is a formula term
(`wagePressureUSD` in `CogsBreakdown`). A real labor market has companies post openings,
workers (or skill/industry cohorts) choose employers based on wage and job security, and
quits/layoffs actually move a worker from one named company's payroll to another's — or to
unemployment, funded by government transfers. This is what makes wage-push inflation,
occupational mix drift (`occupationMixDrift` already exists as a field!), and labor-supply
constraints on high-growth companies *mechanical* instead of parameterized. It is the piece
that decides which company each household (idea 1) is attached to, and why that can change.

### 3. Deeper corporate management and wage system (absorbs backlog #52)
A more in-depth corporate management layer: real hiring/firing decisions driven by capacity
needs and margin pressure, a wage-setting policy per company (not just a region-wide pressure
term), and management-quality effects (`executionQuality` already exists) feeding back into
wage competitiveness and retention. This is the corporate-side counterpart to idea 2 — the
labor market needs someone on the demand side making real wage-offer decisions.

### Household-linked note on institutional realism (cross-reference, not owned here)
Pension funds growing AUM from a real slice of pre-tax wages, with actual actuarial/insurance
modeling for households and corporates, is filed under **Project Wall Street** (backlog #47)
because it's fundamentally a financial-institution mechanism — but it cannot be built for real
until households (idea 1) exist as named agents with real wages to draw a pension contribution
from. Treat Main Street idea 1 as a soft prerequisite for that slice of #47.

## Suggested sequencing
1. Households as real agents (foundation — nothing else here works without it)
2. Real labor market (needs households to exist as the worker-side counterparty)
3. Deeper corporate wage/management system (can be built in parallel with 2, since it's the
   employer-side decision logic that the labor market matches against)

## Source
- New ideas proposed 2026-08-26 in response to "3 more revolutionary projects" discussion.
- Backlog task #52 ("Deeper corporate management and wage system") folded in as constituent idea 3.
