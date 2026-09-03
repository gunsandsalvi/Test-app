# SYSTEM: FX FORWARDS AND CROSS-CURRENCY SWAPS

Buying a currency for later, and swapping funding from one currency into another. Together they
are how a currency exposure gets hedged and how a bank funds a foreign asset — which makes them
the joint between `fx-spot.md`, `banks-funding-and-liquidity.md` and `cross-border.md`.

Satisfies `../instruments/derivative.md`; runs on `the-derivative-layer.md`.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. THE FORWARD
- **A1** REASON — satisfies `../instruments/derivative.md`, answering these its own way:
  - A1.a **D3 underlying** — the **spot rate** at the future date (`fx-spot.md`)
  - A1.b **D4 payoff** — exchange of two fixed amounts at maturity; both notionals **do** move,
    unlike a rate swap
  - A1.c **D7 price** — the **forward rate**, cleared
  - A1.d **D5 currency** — two of them, one per leg, by definition
- **A2** REASON — it **settles**: real amounts in real currencies on the date, into accounts
  (`money-and-settlement.md`)
- **A3** REASON — before then it carries a **mark and margin** like any derivative, so a forward is
  a funding item long before it is a settlement
- **A4** REASON — a **swap** in the FX sense — spot one way, forward back — is the standard form,
  and it is a **secured loan of one currency against another**, which is what it must be modelled
  as

### B. THE FORWARD RATE
- **B1** REASON — the forward rate is **cleared** from what participants will do
  (`the-clearing-engine.md`)
- **B2** VERIFY — it should sit near spot adjusted for the **two currencies' funding costs**,
  because otherwise somebody can borrow one, buy the other, lend it and lock a profit
  - B2.a covered interest parity is therefore a **consequence of an arbitrage somebody takes**,
    never an identity applied to produce the rate
  - B2.b and the arbitrage is **not free**: it uses balance sheet, capital and credit lines, so a
    persistent basis is possible and is a finding about those constraints
- **B3** REASON — the **cross-currency basis** is the deviation, and it is a real price paid by
  whoever needs the currency more
  - B3.a it widens when funding in one currency is scarce, which is exactly when hedgers need it
- **B4** VERIFY — a region running a funding deficit in a foreign currency should pay the basis,
  as a consequence of B3 and not as a rule

### C. THE CROSS-CURRENCY SWAP
- **C1** REASON — **two floating or fixed legs in two currencies**, notionals exchanged at start
  and end, periodic interest on both
  - C1.a it is `interest-rate-swaps.md` with an FX leg attached, and it inherits both curves
- **C2** REASON — its economic use is **funding**: a party that raised money in one currency and
  needs it in another, for years, without an open FX position
- **C3** REASON — the **notional exchange at the end is at the original rate**, which is what
  removes the currency risk and what creates the counterparty risk
- **C4** REASON — its price includes the **basis** in B3, and that is where a foreign-currency
  funding shortage shows up as a number

### D. WHY EACH SIDE IS THERE
- **D1** REASON — an **importer or exporter** with a known future foreign payment
  (`cross-border.md`)
- **D2** REASON — an **investor holding a foreign asset** who wants the asset and not the currency
  (`insurers-and-pensions.md`, `fund-shares.md`)
  - D2.a and it must **roll** the hedge as the asset persists, which is a recurring demand and a
    recurring cost
- **D3** REASON — a **bank funding a foreign-currency book**: it has deposits in one money and
  loans in another (`banks-funding-and-liquidity.md` E, `currency-and-fx.md` B5)
- **D4** REASON — a **dealer**, whose reason is spread, and whose own currency and funding
  positions constrain what it will quote (`dealer-desks.md`)

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no forward rate from a parity formula.** It is cleared, and parity is checked
  against it (B2.a)
- **E2** FORBID — **no hedge that removes the position without a counterparty holding it.** The
  hedger's currency risk went to a named party (`fx-spot.md` E1)
- **E3** FORBID — **no maturity that passes without both legs settling** in full, in both
  currencies (`the-register.md` C3)
- **E4** VERIFY — a party's hedged foreign asset shows: the asset revaluing one way
  (`currency-and-fx.md` D2) and the forward revaluing the other, and the residual is the basis and
  the imperfection — not zero by construction
