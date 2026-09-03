# SYSTEM: THE REGISTER

Who owns what. Every non-money claim in the world — a bond, a share, a fund unit, a loan, a
contract — is an entry saying *this named party holds this much of this instrument*. Money's
equivalent is the account (`money-and-settlement.md`); this tree is everything else.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A HOLDING IS
- **A1** REASON — a holding is a **triple**: named holder, named instrument, quantity
  - A1.a the holder is a party that exists in the world and can be paid
  - A1.b the instrument is one the issuer actually issued, in the size it issued
  - A1.c the quantity is in the instrument's **own unit** — face, shares, units, contracts — and
    the unit travels with the number (rule 9)
- **A2** REASON — a holding is a **claim on a named issuer**, not a token
  - A2.a everything the instrument pays, it pays to whoever the register says holds it, then
- **A3** FORBID — **no holding without a holder.** A residual position on nobody is a defect
  (rule 13), not a rounding line
- **A4** FORBID — **no holding without an issuer.** A claim on a party that never issued it is
  money invented in the ownership dimension

### B. THE ISSUER SIDE
- **B1** REASON — an instrument has an **issued amount**, set when it was issued and changed only
  by an issuance, a buyback, an amortisation or a maturity
- **B2** VERIFY — **Σ holdings = issued amount**, per instrument, always
  - B2.a a shortfall means somebody's claim vanished; a surplus means somebody's was invented
  - B2.b the tolerance is float dust, never a fraction of the issue (rule 28)
- **B3** REASON — the issuer's **liability** is the same number read from the other side, never a
  second stored copy (rule 3)
- **B4** REASON — an instrument **ceases** — matures, is redeemed, defaults into a recovery — and
  when it does every holding in it resolves to something else, named

### C. TRANSFER
- **C1** REASON — ownership changes only by a **transfer with two named sides**: seller loses
  exactly what buyer gains (rule 14, both legs in one pass)
- **C2** REASON — a transfer has a **cause**: a trade, a maturity, a corporate action, a default
  - C2.a and a **price**, if it is a trade, which is the print the market sees (`the-clearing-engine.md` E)
- **C3** REASON — the securities leg and the cash leg are the **same event**
  - C3.a delivery versus payment: neither leg happens without the other
  - C3.b a fail is a real state, not a silent half-settlement
- **C4** FORBID — **no short by accident.** A party cannot deliver what it does not hold; a
  deliberate short is a borrowed position (`securities-lending.md`), which is a different thing
  with a lender on the other side
- **C5** VERIFY — over any window, Σ(quantity bought) = Σ(quantity sold), instrument by instrument

### D. WHAT THE REGISTER MUST ANSWER
- **D1** REASON — **what does this party hold?** — the portfolio, for valuation and for risk
- **D2** REASON — **who holds this instrument?** — the holder list, for paying a coupon and for
  finding who takes the loss on a default
  - D2.a both directions must be answerable; a register that can only answer one of them forces
    the other to be reconstructed, and a reconstruction drifts
- **D3** REASON — **what is it worth?** — quantity × a price that came from a market
  (`the-clearing-engine.md`), never a price stored on the holding
- **D4** REASON — **what did it cost?** — the basis, because a realised gain is a real number and
  somebody is taxed on it

### E. CORPORATE ACTIONS AND EVENTS
- **E1** REASON — a **coupon or dividend** pays to the holders of record, in the instrument's
  currency, and reaches their accounts
- **E2** REASON — an **amortisation or maturity** reduces or extinguishes the holding and pays
  its face
- **E3** REASON — a **default** converts the holding into a recovery claim; the loss lands on the
  holders, in proportion, and on nobody else
- **E4** REASON — a **split, buyback or new issue** changes quantities on both sides at once
- **E5** VERIFY — every event that moves a register also moves money or explicitly says why not

### F. IDENTITY AND SURVIVAL
- **F1** REASON — an instrument has a **stable identity** for its whole life
  - F1.a two instruments with the same terms from the same issuer are still two instruments
- **F2** REASON — a party that **ceases to exist** leaves its holdings to a named successor —
  a resolution estate, a buyer, the state — never to nobody (A3)
- **F3** VERIFY — the register survives a week boundary unchanged unless an event in C or E moved
  it; unexplained drift is a defect
