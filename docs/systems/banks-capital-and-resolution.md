# SYSTEM: BANKS — CAPITAL AND RESOLUTION

What absorbs a bank's losses, how much of it there must be, and what happens when it runs out.
The third reading of the same balance sheet: `banks-lending.md` is its assets,
`banks-funding-and-liquidity.md` its liabilities, this is the residual and its consequences.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT CAPITAL IS
- **A1** REASON — capital is the **residual**: assets minus liabilities. It is not a fund
  - A1.a FORBID — capital is never a pot that is spent. It is what is left, and it falls when a
    loss is booked because the asset fell, not because something was withdrawn
- **A2** REASON — it is **layered**, and the layers absorb in order
  - A2.a **equity** absorbs first and fully
  - A2.b **subordinated debt** absorbs next, and its holders are creditors who took that risk
  - A2.c **senior creditors and depositors** last, and only in resolution
- **A3** REASON — it **grows** by retained earnings and by issuance, and both are decisions
- **A4** REASON — it **falls** by losses and by distributions (dividends, buybacks), and both are
  events with dates

### B. HOW MUCH THERE MUST BE
- **B1** REASON — a **requirement**, expressed against risk-weighted assets
  - B1.a **risk weights differ by asset**, and that is why a bank prefers some assets to others
  - B1.b a **leverage** constraint that does not use weights, as a backstop to B1.a
  - B1.c VERIFY — which binds is an outcome and differs by bank
- **B2** REASON — a **buffer above the requirement** the bank chooses, because hitting the
  requirement has consequences
- **B3** REASON — breaching it triggers **consequences before failure**: distributions restricted,
  a plan demanded, supervision intensified
  - B3.a VERIFY — a bank near the line behaves differently. If it does not, the requirement is
    decorative

### C. WHEN IT RUNS OUT
- **C1** REASON — **insolvency** is assets < liabilities, and it is distinct from illiquidity
  (`banks-funding-and-liquidity.md` D6)
  - C1.a a bank can be **solvent and illiquid**, or **insolvent and liquid**, and the two failures
    have different triggers and different remedies
- **C2** REASON — **recapitalisation** first, if somebody will provide it
  - C2.a existing holders diluted, new money priced by whoever provides it
  - C2.b it can **fail** — nobody has to buy
- **C3** REASON — **RESOLUTION**: the bank stops being a going concern
  - C3.a a **trigger** somebody applies, on an observable
  - C3.b it is not the same as bankruptcy: deposits keep working

### D. THE RESOLUTION ITSELF
- **D1** REASON — a **valuation**: what the assets are actually worth, not their book
  - D1.a and the hole is the difference
- **D2** REASON — **the hierarchy is respected**: equity wiped, then A2.b bailed in, then the rest
  - D2.a VERIFY — no creditor is worse off than in a liquidation. That is the constraint the
    whole design serves
- **D3** REASON — an **acquirer** takes the book, or there is none
  - D3.a it takes assets AND liabilities, and pays or is paid the difference
  - D3.b the acquirer is **choosing**, and can decline
- **D4** REASON — **deposit insurance pays** what the estate cannot, up to the limit, and the
  insurer becomes a creditor of the estate
- **D5** REASON — **the public purse is the last resort**, and it is a **fiscal cost with a payer**
  - D5.a which lands in `the-treasury.md`, as real money
- **D6** REASON — the failed bank's **positions do not vanish**: every book it was on has a
  counterparty problem, and that is contagion (`money-market.md` E3)

### E. AFTER
- **E1** REASON — the **estate** is realised over time, and creditors are paid from it
- **E2** REASON — the **surviving system is more concentrated**, and that is a measurable
  consequence
- **E3** VERIFY — the resolution **conserves**: what the acquirer took, what the insurer paid, what
  the estate realised and what holders lost sum to the hole in D1
