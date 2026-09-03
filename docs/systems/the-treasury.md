# SYSTEM: THE TREASURY

The state's balance sheet: it spends, it taxes, the difference is a deficit, and the deficit must
be funded by selling debt to somebody who chooses to buy it. The instrument is
`sovereign-credit.md`; this tree is the issuer's side — the decisions, the constraint, and what is
forbidden.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT THE TREASURY IS
- **A1** REASON — a **named party with an account** like any other (`money-and-settlement.md`)
  - A1.a it pays out of a balance, and the balance can run low
- **A2** REASON — its money is its region's currency (`currency-and-fx.md` B1)
- **A3** REASON — it has a **balance sheet**: cash, debt outstanding, and whatever it owns
  - A3.a its equity is negative and that is normal; the number is still a read

### B. OUTLAYS
- **B1** REASON — it **spends on named things** — transfers to households, purchases of goods,
  wages, interest — and each reaches a named recipient's account (`households.md` B2)
- **B2** REASON — **interest is an outlay**, and it is the sum of what its own bonds pay, read
  from the register (`the-register.md` E1), never a rate applied to a total
- **B3** REASON — outlays have **causes** that vary: the cycle, unemployment, policy
  - B3.a so they are not a constant, and a downturn raises them while lowering receipts, which is
    the whole reason the constraint in D bites when it does
- **B4** REASON — **maturing debt must be repaid** in full, in cash, on its date, and it is the
  largest single outlay in most weeks

### C. RECEIPTS
- **C1** REASON — **taxes**, levied on real bases: income, consumption, profit
  - C1.a paid by named payers out of their accounts, so the tax is a real flow both ways
- **C2** REASON — receipts **follow the economy**: they fall when income and spending fall
- **C3** VERIFY — receipts are Σ(what was actually collected from named payers), never a rate
  applied to an aggregate the payers were never charged

### D. THE FUNDING CONSTRAINT — THE CORE OF THIS TREE
- **D1** REASON — **outlays − receipts = the amount that must be raised**, and it must be raised
  before it is spent
- **D2** REASON — it is raised by **issuing debt into a market that must clear**
  (`sovereign-credit.md`, `the-clearing-engine.md`)
  - D2.a at whatever price the buyers are willing to pay — the treasury chooses the size and the
    maturity, the market chooses the price
- **D3** FORBID — **there is no central-bank overdraft** (user, 2026-09-03). The treasury cannot
  draw on the central bank to cover a shortfall, directly or by any facility that amounts to it
  - D3.a the central bank may hold sovereign debt **bought in the market** for a policy reason
    (`the-central-bank.md` E) — that is a different act, with a price and a seller
- **D4** REASON — **issuance is managed to cover outlays** (user, 2026-09-03): the treasury runs a
  programme, forward-looking, sized against what it knows it must pay
  - D4.a it knows its maturity profile, so a wall is foreseeable and pre-funded
  - D4.b it holds a **cash buffer**, because the alternative to a buffer is dependence on every
    single auction clearing
- **D5** REASON — **an auction can fail** (`the-clearing-engine.md` C4), and the failure has
  consequences the treasury must then handle: pay from the buffer, cut or defer an outlay, come
  back at a different size or maturity
  - D5.a FORBID — **no forced buyer.** Nobody is obliged to bid, and no participant absorbs the
    unsold remainder by construction
- **D6** VERIFY — the debt outstanding is the accumulated deficit plus rollovers, read from the
  register, and it reconciles

### E. DEBT MANAGEMENT
- **E1** REASON — the treasury **chooses the maturity mix**, and the choice has a trade-off: short
  is cheaper when the curve is upward-sloping and rolls more often
- **E2** REASON — it chooses **size and timing** per auction, against its cash position
- **E3** REASON — the **cost of its debt is a consequence** of what it has issued and at what
  prices, accumulated — never a rate it sets
- **E4** VERIFY — heavier issuance into the same demand should show up in the clearing price, and
  then in E3 with a lag; if it does not, the auction is not reading the size

### F. THE FISCAL FEEDBACK
- **F1** REASON — spending is **somebody's income** (`households.md` B2, `goods.md`)
- **F2** REASON — taxes are **somebody's outflow**, and they reduce what that party can spend
- **F3** REASON — interest paid is **income to holders**, most of whom are domestic
- **F4** VERIFY — the fiscal balance and the private sector's net saving move together, as an
  accounting consequence and not as an enforced identity
