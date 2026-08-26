# Architecture & System Design — Economy Simulator

## Simulation Pipeline Stages (`src/engine/simulation/stages/`)
1. `01-macro-feedback.ts` — Micro-to-macro feedback aggregation (margin compression, contagion, employment/health signals).
2. `02-region-macro.ts` — Macroeconomic region evolution (`evolveRegionMacro`), ownership-share drift, and rate-change collection.
3. `03-category-demand.ts` — Consumption, investment, and government (C+I+G) demand-target computation and smoothing.
4. `04-input-output.ts` — Inter-industry input-cost-pressure loop.
5. `05-unit-bidding.ts` — Sub-unit bidding market execution (`executeSubUnitBiddingMarket`) and clearing loop.
6. `06-fx-and-trade.ts` — Foreign exchange rate evolution and cross-border trade flow computation.
7. `07-commodities.ts` — Commodity price evolution mapping across all tracked commodities.
8. `08-company-fundamentals.ts` — Orchestrates per-company updates (interest, margins, product lines, revenue, capex, credit, payouts).
9. `09-concentration-risk.ts` — Contract-concentration flag computation for corporate suppliers and customers.
10. `10-ipo-and-ma.ts` — Initial public offering (IPO) and merger & acquisition (M&A) checks and execution.
11. `11-fiscal-and-sovereign-debt.ts` — Government deficit calculation, debt tranche issuance, and bond-holding absorption.
12. `12-portfolio-and-positions.ts` — Position mark-to-market valuation for every tracked asset type.
13. `13-news-and-turn-summary.ts` — News item generation, turn summary assembly, and game-over condition checks.

## Generative Bootstrap Modules (`src/engine/bootstrap/`)
1. `population.ts` — Population and productivity-per-capita primitives per region.
2. `labor-and-wages.ts` — Employable population, occupation-pool sizes, and endogenous wage derivation.
3. `firms.ts` — Generative firm spawning across industries with parameterized concentration curves.
4. `category-demand.ts` — Initial C+I+G demand derivation and per-region category unit prices.
5. `commodities-and-fx.ts` — Resource endowment-based commodity pricing and relative purchasing power FX rates.
6. `yield-curves.ts` — Nelson-Siegel curve parameters and regional policy rates derived from regional neutral rates.

## Domain Models (`src/domain/`)
1. `banking.ts` — Banking sector balance sheet, capital ratios, and loan books.
2. `company.ts` — Corporate enterprise structures, balance sheets, and product lines.
3. `events.ts` — Simulation news items, headlines, and economic events.
4. `game-state.ts` — Top-level game state container and time tracking.
5. `geography.ts` — Regions, trade zones, and geographic metadata.
6. `index.ts` — Domain barrel exports.
7. `industry.ts` — Industry classifications and sub-unit demand intensities.
8. `institutions.ts` — Institutional sector asset holdings and portfolio allocations.
9. `instruments.ts` — Financial instruments (equities, bonds, derivatives, loans, positions).
10. `market-microstructure.ts` — Order books, bids, offers, and unit bidding markets.
11. `markets.ts` — Composite market indices and valuation metrics.
12. `portfolio.ts` — User portfolio, cash, NAV, margin utilization, and return attribution.
13. `region-macro.ts` — Regional macroeconomic indicators (GDP, inflation, unemployment, policy rates).

## Invariants Enforced by Harnessed Verification (`scripts/invariants.ts`)
1. **NaN & Infinity Purity**: Asserts zero non-finite numbers across company financials, macro indicators, banking sectors, and composite indices.
2. **Ownership Conservation**: Asserts that total equity ownership shares across all holders sum to exactly 100% for every active company.
3. **Portfolio NAV Identity**: Asserts that `portfolio.navUSD` equals cash plus total position mark-to-market values.
4. **Trade Fee Conservation**: Asserts that spread costs and counterparty fees balance correctly between user cash debits and dealer bank equity credits.
5. **Policy Rate Stability**: Asserts that regional policy rates remain bit-identical between consecutive non-meeting weeks.
