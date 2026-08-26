# Architecture & System Design — Economy Simulator

## Simulation Engine (`src/engine/`)
1. `simulation.ts` — Public entry point; re-exports `advanceWeeklyStep` and `createInitialGameState`.
2. `simulation/core.ts` — Thin orchestrator: builds a `WeeklyStepContext` (`stages/context.ts`) and runs the thirteen weekly-step stages below against it in order, returning the final `GameState` from the last stage.
   - `simulation/stages/context.ts` — Defines `WeeklyStepContext`, the single mutable object every stage reads and writes, and `createInitialContext`, which seeds it from the incoming `GameState`. The stages share one context rather than each taking a narrow, minimal interface — this is the explicit, typed equivalent of what a single closure-based function used to capture implicitly, so every cross-stage dependency is visible instead of an accident of variable scope.
   - `simulation/stages/shared-helpers.ts` — Pure helper functions used by two or more stages: expected-loss/rating-bucket/demand-premium credit math, occupation labor demand, holder-class ownership-share targets, and itemized-holdings attribution.
   - `simulation/stages/01-macro-feedback.ts` — Cross-region macro feedback signals (credit contagion, systemic stress, floating-principal/health tracking) consumed by later stages.
   - `simulation/stages/02-region-macro.ts` — Per-region macro evolution (`macro/evolution.ts`), equity/bond ownership-share drift, cross-border spillover.
   - `simulation/stages/03-category-demand.ts` — C+I+G demand targets per industry sub-unit, smoothed toward target; quarterly supplier/customer relationship formation.
   - `simulation/stages/04-input-output.ts` — Inter-industry input-cost clearing (`CATEGORY_INPUT_REQUIREMENTS`).
   - `simulation/stages/05-unit-bidding.ts` — Per-sub-unit bidding markets that clear price from firm-level bids/offers.
   - `simulation/stages/06-fx-and-trade.ts` — FX pair evolution and cross-border category trade flows.
   - `simulation/stages/07-commodities.ts` — Commodity spot/futures curve evolution.
   - `simulation/stages/08-company-fundamentals.ts` — The full per-company weekly update: revenue, margins, capex/debt funding, credit rating, bond/loan/equity pricing, earnings, buybacks. By far the largest stage.
   - `simulation/stages/09-concentration-risk.ts` — Flags >40% supplier/customer concentration per company from active supply contracts.
   - `simulation/stages/10-mergers.ts` — Quarterly M&A consolidation (cash/stock consideration, debt/product-line transfer, target wind-down).
   - `simulation/stages/11-fiscal-and-sovereign-debt.ts` — Itemized bank/institutional holdings attribution, bottom-up GDP derivation, government deficit/debt-tranche issuance, and weekly news generation.
   - `simulation/stages/12-portfolio-and-positions.ts` — Composite index recomputation and full portfolio mark-to-market (carry, financing, margin, greeks, P&L attribution) across every asset type.
   - `simulation/stages/13-news-and-turn-summary.ts` — IPO checks (their original execution point — see the file's header for why it isn't adjacent to stage 10's merger logic), cash/NAV/margin settlement, and final turn-summary/`GameState` assembly.
3. `simulation/initialization.ts` — Builds the initial `GameState` (`createInitialGameState`): regions, FX pairs, commodities, composite indices, companies, dealers, and the starting portfolio.
4. `simulation/credit.ts` — `determineCreditRating`: maps leverage/interest-coverage to a letter rating.
5. `simulation/ipo.ts` — `checkForIPO`: periodic per-region IPO issuance of new companies.
6. `simulation/merger.ts` — M&A candidate scoring and execution between existing companies.
7. `simulation/trade.ts` — `executeTrade`: applies a user-initiated trade to the portfolio and sourcing region.
8. `simulation/constants.ts` — Sector pricing-power and wage-sensitivity constant tables used by `core.ts`.
9. `companyGenerator.ts` — Initial and IPO company generation (financial templates, debt tranches, ratings).
10. `dealers.ts` — Static dealer/counterparty roster (`DEALERS`) used for trade sourcing and spreads.
11. `pricing.ts` — Closed-form pricing functions: corporate bonds, leveraged loans, IRS, CDS, XCS, commodity futures; sector P/E (Gordon growth model) and rating-spread (geometric progression off `credit.ts`'s cutoffs) tables generated from a shared discount-rate primitive rather than quoted multiples.
12. `nelsonSiegel.ts` — Nelson-Siegel sovereign yield curve model (zero rates, discount factors, bond pricing).
13. `blackScholes.ts` — Black-Scholes-Merton option pricing and Greeks.
14. `carryCalculator.ts` — Expected weekly carry/financing cost estimation per asset type.
15. `newsGenerator.ts` — Weekly news item generation from macro, credit, and earnings events.
16. `formatters.ts` — Currency/percent/date formatting and the simulation calendar anchor.
17. `macroEngine.ts` — Barrel re-export of `macro/*` modules.
18. `macro/initialization.ts` — Initial regions, FX pairs, commodities, wealth distribution, and sub-unit price seeding.
19. `macro/evolution.ts` — Weekly region macro evolution (GDP, inflation, wages, ownership drift), FX and commodity price evolution.
20. `macro/banking.ts` — `evolveBankingSector`: bank balance sheet, capital ratio, and NIM evolution.
21. `macro/indices.ts` — Composite benchmark index calculation from constituent company prices.
22. `macro/weather.ts` — Regional weather anomaly generation (commodity supply-shock driver).
23. `macro/utils.ts` — Shared helpers (e.g. synthetic 52-week history generation).
24. `bootstrap/population.ts` — Per-region population and productivity-per-capita as relative multiples of a shared reference unit.
25. `bootstrap/labor-and-wages.ts` — Per-region occupation wage table derived from productivity, replacing a flat wage constant.
26. `bootstrap/firms.ts` — Generative per-region firm seeding (Pareto-ranked revenue/margin/leverage by sector, bank/insurer/asset-manager/pension-fund roles, commodity producers); computed credit ratings.
27. `bootstrap/category-demand.ts` — Sub-unit unit price as dollar demand ÷ estimated physical volume (population and firm-count based).
28. `bootstrap/commodities-and-fx.ts` — Generic (non-real-ticker) commodity definitions priced off a cost-of-production primitive; FX rates from relative purchasing power.
29. `bootstrap/yield-curves.ts` — Neutral rate from generated productivity growth plus an inflation-target primitive; policy rate and Nelson-Siegel parameters derived from it.

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
2. **Ownership Conservation**: Asserts that bank/institutional/foreign/central-bank equity, corporate-bond, and sovereign-bond ownership shares never exceed 100% (with the residual implied as household share) for every region.
3. **Portfolio NAV Identity**: Asserts that `portfolio.navUSD` equals cash plus total position mark-to-market values.
4. **Trade Fee Conservation**: Asserts that spread costs and counterparty fees balance correctly between user cash debits and dealer bank equity credits.
5. **Mark-to-Market Unfreezing**: Asserts that after opening a position and advancing one week, `portfolio.navUSD` and the position's `unrealizedPnL` actually move when the underlying price moves — guards against the portfolio state being silently frozen.
6. **Policy Rate Stability**: Asserts that regional policy rates remain bit-identical between consecutive non-meeting weeks.
7. **Default/Merger Disjointness**: Asserts a company is never simultaneously `isDefaulted` and `mergerAcquired`.
8. **Bank Capital & NIM Bands**: Asserts USA bank capital ratio stays within [0.05, 0.35] and net interest margin within [0.01, 0.08].
9. **IPO EPS Accuracy**: Asserts newly issued IPO companies' stored EPS is consistent with `netIncome / sharesOutstanding`.
10. **Revenue Growth Ceiling**: Asserts no company's revenue grows beyond 20x its initial baseline over a 260-week run.
11. **Sovereign Debt Absorption**: Asserts bank/institutional sovereign bond holdings growth tracks the expected market-funded portion of each region's deficit over rolling 13-week windows.
12. **Equity Demand Moves Price Beyond EPS**: Asserts that a sustained institutional equity under-allocation, once corrected by the holder-class rebalancing flow, visibly moves a company's stock price beyond what its EPS change alone explains.
13. **Sovereign Auction Outcome Moves Yields**: Asserts that a region with sharply reduced bank/institutional absorption capacity sees its 10Y yield rise the following week relative to a baseline run.
