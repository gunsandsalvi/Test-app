# SYSTEM: SME POOLS

Small and medium firms, held as pools rather than as individually named parties, and the
securitised claims on them. Two things are going on and both belong here: a **sector of the real
economy** too numerous to model one by one, and a **structured credit instrument** whose whole
purpose is turning many small unrated loans into a few tradable claims.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. THE SECTOR
- **A1** REASON — SMEs are **firms** and satisfy `firm-fundamentals.md`: they sell, employ, borrow
  and can fail
- **A2** REASON — they are represented as a **pool with a distribution**, not as an average
  - A2.a FORBID — **no representative SME.** Default is a threshold event; with one average firm a
    mean-preserving spread causes no defaults, and the entire credit content of the sector is gone
    (`households.md` A2.d is the same argument)
- **A3** REASON — the pool has **observable characteristics**: size, sector, region, leverage,
  coverage — and losses depend on the distribution of those, not the mean
- **A4** REASON — they **employ people** (`labour.md`) and **buy from and sell to** larger firms
  (`trade-credit.md`), so the sector is connected in both directions
- **A5** REASON — they are **bank-dependent**: too small for the bond market
  (`corporate-credit.md`), so `banks-lending.md` is where their funding comes from
  - A5.a which makes them the sector where a credit tightening bites first and hardest

### B. THE LOANS
- **B1** REASON — each is a **loan from a named lender** with a rate, a term and an amortisation
  (`banks-lending.md` C)
- **B2** REASON — they are often **secured** on the firm's assets or the owner's house
  (`housing.md` C1)
- **B3** REASON — they **default**, and the default depends on the individual firm's cash flow
  (`firm-fundamentals.md` D4), aggregated over the pool
- **B4** REASON — **defaults are correlated**: the same rates, the same demand, the same region
  hit all of them
  - B4.a so the pool's loss is **not the sum of independent draws**, and the correlation is what
    makes the tranching in C meaningful or dangerous

### C. THE POOL AS AN INSTRUMENT
- **C1** REASON — the loans are **transferred into a vehicle** — a named party holding them
  (`the-register.md`), funded by issuing claims
- **C2** REASON — the claims are **tranched by seniority**: losses hit the bottom first, and the
  top is protected until the bottom is gone
  - C2.a the tranche boundaries are **stated**, and the loss allocation is a real rule applied to
    real losses
- **C3** REASON — each tranche has a **price that clears** (`the-clearing-engine.md`), and its
  yield is derived from that price (rule 1)
- **C4** REASON — the tranches are **held by named holders**, and that is where the loss actually
  lands (`the-register.md` E3)
  - C4.a often the originating bank keeps the bottom, which means the risk did not leave
- **C5** REASON — the vehicle's **cash flows are the loans' cash flows**: interest and principal
  in, distributed by seniority out
- **C6** VERIFY — Σ tranche values = the pool's value; Σ losses allocated = Σ losses incurred,
  exactly. No tranching creates or destroys loss (rule 3)

### D. WHY IT MATTERS
- **D1** REASON — it **moves credit risk from banks to investors**, and the investors are named
  (`insurers-and-pensions.md`, `fund-shares.md`, `hedge-funds.md`)
- **D2** REASON — it **frees bank capital** (`banks-capital-and-resolution.md`), which lets the
  bank lend again — so securitisation is a lending-capacity mechanism, not just an instrument
- **D3** REASON — the senior tranche is **used as collateral** (`money-market.md`), so its
  liquidity matters to the funding system
- **D4** REASON — when B4's correlation is worse than the tranching assumed, the **senior tranche
  takes losses it was not supposed to**, and every holder in D1 and D3 is affected at once
  - D4.a VERIFY — this must be emergent from B4 and C2, never a scripted event

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no pool without underlying loans to named borrowers.** A pool whose losses come
  from a loss rate has no A3, no B3 and no D4
- **E2** FORBID — **no tranche without a holder** (`the-register.md` A3)
- **E3** FORBID — **no risk transfer without a transferee.** If the bank's exposure fell, somebody
  named picked it up (C4)
