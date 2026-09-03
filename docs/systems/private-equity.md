# SYSTEM: PRIVATE EQUITY

Buying whole firms with borrowed money, holding them unlisted, and selling them later. It belongs
in this world because it is the demand side of `corporate-credit.md`'s leveraged loan, the buyer
in `m-and-a.md`, and the one owner type whose horizon is years rather than weeks.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. THE STRUCTURE
- **A1** REASON — a **fund** with committed capital from named investors
  (`insurers-and-pensions.md` C, `households.md` D1)
- **A2** REASON — capital is **committed, not paid**: it is **called** when a deal needs it, and
  the call is a real payment from the investor's account on a date it cannot refuse
  - A2.a so an investor must hold liquidity against calls it did not choose the timing of, and in
    a stress the calls and its own troubles arrive together
- **A3** REASON — a **manager** earning a fee on committed capital and a share of the gains
- **A4** REASON — the fund has a **life**: it invests, it holds, it exits, it winds up
- **A5** REASON — the acquired firms are **held in named vehicles**, and each is a party with its
  own balance sheet (`firm-fundamentals.md`)

### B. THE BUYOUT
- **B1** REASON — it buys a firm at a **price**, agreed with the sellers (`m-and-a.md`)
- **B2** REASON — most of the price is **debt raised against the target itself**
  (`corporate-credit.md`, `banks-lending.md`)
  - B2.a the debt is the **target's** liability, not the fund's — which is why a failed buyout
    kills the firm and not the fund
  - B2.b so the deal only happens if lenders will lend, at a price: **the credit market decides
    which buyouts occur**, and that is a real constraint, not a rate applied to a plan
- **B3** REASON — the **equity cheque is the rest**, funded by A2
- **B4** REASON — the target's balance sheet is **transformed at the moment of purchase**:
  leverage up, interest cost up, ownership changed in the register (`the-register.md` C)
- **B5** VERIFY — the sources and uses of a deal must balance exactly, and the money must come out
  of named accounts

### C. THE HOLD
- **C1** REASON — the firm **operates and services its debt** out of cash flow
  (`firm-fundamentals.md` D), and the higher leverage means less room
- **C2** REASON — the owner **influences the firm**: investment, costs, dividends
  (`the-capital-programme.md`)
- **C3** REASON — it can **recapitalise**: raise more debt to pay itself a dividend, which is a
  real transfer from the firm's future to the owner's present
- **C4** REASON — it can **fail**: the leverage in B2 makes default a real outcome, and the loss
  falls on the lenders (`corporate-credit.md`) and wipes the equity
- **C5** REASON — the holding has a **value that is not a market price**: no clearing, so it is a
  mark
  - C5.a FORBID — **an unlisted mark is not a cleared price**, and it must never be treated as one
    by the holder's own accounts (rule 1's boundary: the honest answer is "marked, not cleared")

### D. THE EXIT
- **D1** REASON — it **sells**: to another fund, to a corporate buyer (`m-and-a.md`), or to the
  public market (`equity.md`)
- **D2** REASON — the exit produces a **cleared price**, which is the first real price the holding
  has had (C5.a)
- **D3** REASON — proceeds are **distributed to the investors**, in cash, into their accounts
- **D4** REASON — the exit **depends on the market being open**: in a bad market it does not
  happen, the hold extends, and the distributions do not arrive
  - D4.a which feeds back to A2.a — investors owe calls and are not receiving distributions at the
    same time
- **D5** VERIFY — the fund's returns are a read of D3 against A2, and both are actual cash

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no buyout without a lender who agreed to lend** (B2.b)
- **E2** FORBID — **no capital call that is not paid from a real balance**
- **E3** FORBID — **no exit at a price nobody paid** (D2)
