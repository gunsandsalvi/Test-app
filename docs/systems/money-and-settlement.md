# SYSTEM: MONEY AND SETTLEMENT

What money IS in this model, where it sits, and how it moves. The ledger: accounts, payments,
wires, and the interbank leg behind them. Every other system's cash leg lands here, so an error
here is an error everywhere.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut. **Contaminated**: I rebuilt much of this layer
earlier in the same session (§9.13c), so treat the confirmations as worthless and judge it on
branches D, E and F.

### A. WHAT MONEY IS
- **A1** REASON — money is a **liability of somebody**. Every unit is owed by a named issuer
  - A1.a a **deposit** is a named bank's liability to a named holder
  - A1.b a **reserve** is the central bank's liability to a named bank
  - A1.c **currency in circulation** is the central bank's liability to a bearer
  - A1.d FORBID — **no money without an issuer.** A balance that is nobody's liability is money
    created from nothing, and it is the defect every conservation check exists to catch
- **A2** REASON — money is **denominated**: a unit is a unit OF a currency (see `currency-and-fx`)
  - A2.a a holder's own money is the one it keeps its books in
  - A2.b FORBID — two currencies are never added. A sum across them is a conversion at a stated
    rate, or it is meaningless
- **A3** REASON — money is **fungible within its issuer and currency** and not across them
- **A4** VERIFY — the **money stock** is a read of A1's liabilities, never a stored aggregate

### B. WHERE IT SITS
- **B1** REASON — an **ACCOUNT** is (holder, issuer, currency). All three, or it is ambiguous
  - B1.a a holder may have several, and holding a foreign currency is a real position
  - B1.b VERIFY — Σ(accounts at an issuer) = that issuer's money liability
- **B2** REASON — a balance is **carried**, week to week, and changes only by a named movement
- **B3** REASON — a balance can be **negative**, and what that means differs by holder
  - B3.a a customer overdrawn is **borrowing**, and it is a credit decision by its bank
  - B3.b a bank overdrawn at the central bank is **borrowing from the central bank**, and the
    corridor prices it (`money-market.md` C)
  - B3.c FORBID — an overdraft is never a silent negative. Somebody lent it, at a rate

### C. HOW IT MOVES
- **C1** REASON — a **PAYMENT** is an instruction: payer, payee, amount, **currency**, reason
  - C1.a it names both sides. A payment to nobody is not a payment
  - C1.b it carries the **reason** it happened, so a unit is traceable to why it moved
  - C1.c it may be **dated**: an obligation falling due later is an instruction now and cash then
- **C2** REASON — settlement applies each instruction by **one rule**: payer −a, payee +a
  - C2.a and **the interbank leg**: where the two sit at different banks, reserves move between
    those banks. That is what settlement IS
  - C2.b same-bank payment moves **no reserves** — it is a relabelling of one bank's liability
  - C2.d VERIFY — Σ(all legs) = 0, per currency, every pass
- **C3** REASON — a payment across currencies is **two amounts and a rate**, and somebody sells
  the currency (`money-market`/`fx-spot`). Never a restatement of one number
- **C4** REASON — **the money creators are enumerable and few**
  - C4.a a **bank writing a loan** creates a deposit (`banks-lending.md` B)
  - C4.b the **central bank** buying an asset or lending creates reserves
  - C4.c VERIFY — the money stock's change equals C4.a + C4.b and nothing else. Any other source
    is A1.d

### D. THE WIRE — EVERY MOVE IS AN INSTRUCTION
- **D1** REASON — **every asset move is a numbered instruction**, money included: from, to, asset,
  quantity, price, reason
  - D1.a it is numbered, so a position can be **replayed** from its wires
  - D1.b a residual is therefore a **missing wire**, never a mystery
- **D2** REASON — money is an **asset like any other** in this ledger: a quantity of a currency at
  a price of one of itself
- **D3** VERIFY — for every asset kind, Σ(wires in) − Σ(wires out) = the change in holdings
- **D4** FORBID — **no move without a wire.** A book that changes with no instruction behind it is
  the same defect as A1.d, one level up

### E. FAILURE AND FINALITY
- **E1** REASON — a payer that **cannot pay** is a real state with a real consequence
  - E1.a it does not silently not happen, and it does not silently overdraw
  - E1.b the payee has a **receivable that did not arrive** — see `trade-credit`
- **E2** REASON — **settlement is final**: once applied, a payment is not reversed
  - E2.a an error is corrected by a **new** payment in the other direction, which is itself
    traceable
- **E3** REASON — **order matters within a pass**, and the order is defined. Two instructions that
  both draw on one balance cannot both succeed by luck
- **E4** REASON — a party that **ceases to exist** mid-pass still has its legs settled or refused
  by name — never dropped

### F. WHAT SETTLEMENT REPORTS
- **F1** REASON — the pass produces a **statement per book**, in that book's own money
  - F1.a a treasury's flows, a household sector's, a bank's reserves, a pool's income
  - F1.b FORBID — a per-book statement is never a sum across currencies (A2.b)
- **F2** REASON — the **gross** and the **net** are different numbers and both are reported
- **F3** VERIFY — the clearing house's residual is **zero**, per asset and per currency
- **F4** VERIFY — money that landed on a holder with no account is **counted, never dropped**
