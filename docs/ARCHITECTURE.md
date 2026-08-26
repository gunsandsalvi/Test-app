# Architecture & System Design — Economy Simulator

## Simulation Engine (`src/engine/`)
1. `simulation.ts` — Public entry point; re-exports `advanceWeeklyStep` and `createInitialGameState`.
2. `simulation/core.ts` — The weekly simulation tick (`advanceWeeklyStep`): macro feedback, region evolution, category demand, sub-unit bidding markets, FX/commodity evolution, per-company fundamentals, IPO/M&A checks, sovereign debt issuance, portfolio mark-to-market, and turn-summary assembly, all in one file.
3. `simulation/initialization.ts` — Builds the initial `GameState` (`createInitialGameState`): regions, FX pairs, commodities, composite indices, companies, dealers, and the starting portfolio.
4. `simulation/credit.ts` — `determineCreditRating`: maps leverage/interest-coverage to a letter rating.
5. `simulation/ipo.ts` — `checkForIPO`: periodic per-region IPO issuance of new companies.
6. `simulation/merger.ts` — M&A candidate scoring and execution between existing companies.
7. `simulation/trade.ts` — `executeTrade`: applies a user-initiated trade to the portfolio and sourcing region.
8. `simulation/constants.ts` — Sector pricing-power and wage-sensitivity constant tables used by `core.ts`.
9. `companyGenerator.ts` — Initial and IPO company generation (financial templates, debt tranches, ratings).
10. `dealers.ts` — Static dealer/counterparty roster (`DEALERS`) used for trade sourcing and spreads.
11. `pricing.ts` — Closed-form pricing functions: corporate bonds, leveraged loans, IRS, CDS, XCS, equities, commodity futures; sector P/E and rating-spread reference tables.
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
