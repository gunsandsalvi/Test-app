# Project Wall Street — Banking, Capital Markets & Money

> Status: **Not started.** Queued after the "1$ is 1$" project (see `docs/ONE_DOLLAR_PROJECT.md`).
> Theme: every loan, every share issued, every currency conversion clears against a real,
> named counterparty — a bank, an asset manager, another region's market — never an abstract
> formula.

## Why this bucket exists

"1$ is 1$" traced real-economy dollars (goods, capex, wages) to real counterparties. Wall
Street does the same for *financial* dollars: today debt is priced off an abstract yield
curve, equity issuance doesn't really exist as a market transaction, the institutional sector
(banks/insurers/asset managers) is a thin aggregate, and monetary policy is a global dial
(`policyRate`) that every formula reads rather than something transmitted through real
interbank borrowing. This bucket makes the financial system as real as the corporate one.

## Constituent ideas

### 1. Real credit/banking system
Loans and deposits live on named bank balance sheets with real capital constraints (a bank
can't lend past its capital/leverage limits), replacing the abstract yield-curve-priced debt
and the macro `reg.bankingSector` aggregate. Corporate defaults become a real credit event on
a specific bank's book, not a statistic. This has the widest knock-on effects of anything in
this bucket — it touches M&A financing, capex funding, and default contagion.

### 2. Interbank market + central bank as a real mechanical counterparty
Banks get reserve accounts and an actual interbank lending market for reserves (short banks
borrow from long banks at a market-clearing rate). The central bank only acts through real
operations — repo, discount-window lending, QE/QT as literal securities purchases/sales
against named counterparties (banks, government debt) — instead of `policyRate` being a
parameter every formula reads directly. "The Fed cuts rates" becomes: the central bank offers
reserves at a rate, banks decide whether to borrow, and everything downstream (loan pricing,
credit availability) is the emergent result of who actually borrowed.

### 3. Realistic corporate debt/equity issuance with bank placement agents (backlog #46)
Companies can issue new debt or new equity to fund expansion, M&A, refinancing, or general
corporate purposes. One or more banks act as placement agents, finding the clearing spread (for
debt) or clearing price (for equity, fixing share count and discovering price via real demand)
to place the issuance, earning a fee. This is the primary-market counterpart to the existing
secondary-market pricing the sim already has.

### 4. Deeper, more realistic institutional sector (backlog #47)
Asset managers need to raise AUM from someone, competing on fees, and earn revenue on
management fees rather than an ambient number. Pension funds are non-profit but grow AUM by
receiving a real portion of pre-tax wages (see Project Main Street idea 1 for the household
side of that flow) that is later drawn down by pensioners, requiring actual actuarial/insurance
modeling that both households and corporates can use.

### 5. Corporate hedging (backlog #53)
Allow companies to hedge FX, rate, or commodity-input exposure where relevant (e.g., a
company with heavy floating-rate debt hedging rate risk, or an importer hedging FX) — real
derivative-like positions taken against a real counterparty (bank/dealer), not an automatic
smoothing formula.

### 6. Real international trade and FX
If regions represent different countries/currencies, cross-region flows should be literal
export/import transactions with an FX rate that emerges from actual currency demand (a company
needing to pay a foreign counterparty), converted by a bank or a real FX market — not an
assumed peg. This makes trade deficits, competitive devaluation, and import-cost shocks
emergent rather than assumed, and gives capital flows (foreign purchases of another region's
debt/equity) a real settlement mechanism. **Caveat: only relevant if regions are meant to be
distinct currency zones — skip entirely if all regions share one currency.**

## Suggested sequencing
1. Real credit/banking system (foundation for everything else here)
2. Interbank market + central bank (needs banks to exist first)
3. Debt/equity issuance with placement agents (needs banks to exist as placement agents)
4. Deeper institutional sector (asset managers/pension funds — can run in parallel with 3)
5. Corporate hedging (needs a real counterparty — bank/dealer — to hedge against)
6. International trade & FX (independent of 1-5, but confirm the currency-zone premise first)

## Source
- New ideas (1, 2, 6) proposed 2026-08-26 in response to "3 big revolutionary projects" /
  "3 more" discussion.
- Backlog tasks #46, #47, #53 folded in as constituent ideas 3, 4, 5.
