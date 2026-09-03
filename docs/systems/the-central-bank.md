# SYSTEM: THE CENTRAL BANK

The issuer of reserves and the setter of the policy rate. Its balance sheet, its operations and
its relationship with the treasury. The corridor it runs is in `money-market.md` C; this tree is
the institution behind it.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT IT IS
- **A1** REASON — the **monopoly issuer of reserves** in its currency
  - A1.a which is why it can always meet an obligation in that currency, and why it can never run
    out — see `sovereign-credit.md` A4.b
- **A2** REASON — it has a **balance sheet**, and it is a real one
  - A2.a **liabilities**: reserves, currency, the treasury's account, the reverse-repo window
  - A2.b **assets**: sovereign paper, loans to banks, FX reserves, claims on other central banks
  - A2.c VERIFY — assets = liabilities + its own equity, every week, and its equity includes a
    **revaluation account** for positions held in another money
- **A3** REASON — it has a **mandate**: an objective it is trying to achieve, stated
- **A4** REASON — it is **independent of the treasury operationally** and owned by it financially,
  and both halves have consequences (E)

### B. THE POLICY RATE
- **B1** REASON — it **sets** a rate, as a decision, on a rule or a judgement
  - B1.a against its mandate: inflation against target, activity against capacity
- **B2** REASON — the rate is **administered, not traded**: it is a price it declares
- **B3** REASON — it makes the rate **effective** through the corridor (`money-market.md` C), not
  by assertion
  - B3.a FORBID — the policy rate never appears directly as a market's cleared rate. If the money
    market's rate equals the policy rate by construction, the corridor is decoration
- **B4** VERIFY — the market rate tracks the policy rate **because** of B3, and the gap is
  information

### C. OPEN-MARKET OPERATIONS
- **C1** REASON — it **buys and sells** sovereign paper, in a size **it** chooses
  - C1.a the size is set by **policy**, never by an auction's weakness
  - C1.b FORBID — it is not a buyer of last resort in the primary market. That is what primary
    dealers' obligations are for (`sovereign-credit.md` C3.a)
- **C2** REASON — a purchase **creates reserves**; a sale destroys them
  - C2.a it pays with money it creates, so there is no debit anywhere. That is what a central-bank
    purchase IS
- **C3** REASON — it is a **price-taker in the auction**: it posts a quantity, not a level
- **C4** REASON — **reinvestment** of maturities is a separate decision from new purchases, and
  the difference is QT

### D. LENDING TO BANKS
- **D1** REASON — the **standing facility**: it lends against collateral at a stated rate
- **D2** REASON — **collateral eligibility and haircuts** are its choice, and they are a policy
  instrument in themselves
- **D3** REASON — **the lender of last resort**: freely, against good collateral, at a penalty, to
  the solvent
  - D3.a FORBID — drop any of the four and it is a subsidy. In particular it does not lend to a
    bank that is **insolvent** — that bank goes to `banks-capital-and-resolution.md` C3
- **D4** REASON — it can **refuse**, and refusal must be reachable

### E. THE TREASURY RELATIONSHIP
- **E1** REASON — the treasury **banks with it**, and its account is a liability (A2.a)
- **E2** FORBID — **no automatic overdraft.** See `sovereign-credit.md` A3.b: an advance that
  appears whenever the account is empty converts a fiscal failure into an accounting entry
- **E3** REASON — **remittance**: its net income goes to the treasury, because the treasury owns it
  - E3.a income, not revaluation. An unrealised FX gain is not remitted (A2.c)
- **E4** REASON — it can make a **loss**, and a loss is not remitted — it reduces its equity, and
  the treasury may have to make it good
- **E5** VERIFY — its holding of sovereign debt is economically consolidated away and
  accounting-wise is not (`sovereign-credit.md` H5)

### F. FX
- **F1** REASON — it holds **reserves in other currencies**, and they are real assets
- **F2** REASON — it can **intervene**, bounded by F1 — and a bank at zero cannot defend anything
  - F2.a which is why a peg breaks: the constraint is real, not a rule
- **F3** REASON — its foreign claims **revalue**, into A2.c's revaluation account
- **F4** REASON — **claims on other central banks** from cross-border settlement are bilateral and
  sum to zero across the world
