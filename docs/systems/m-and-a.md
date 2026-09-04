# SYSTEM: M&A AND CORPORATE CONTROL

One firm buying another. It belongs in this world because it is what makes equity a claim on
*control* rather than just on a dividend stream, because it is a large use of credit
(`corporate-credit.md`, `private-equity.md`), and because it is the mechanism by which a cheap firm
stops being cheap.

Node types, per `README.md`: **REASON**, **VERIFY**, **FORBID**.

---

## 1. THE REQUIRED TREE

Written 2026-09-03 from the domain, code shut.

### A. WHAT A DEAL IS
- **A1** REASON — an **acquirer**, a **target**, and a **price per share** that the target's owners
  accept (`equity.md`)
- **A2** REASON — the ownership of the target **transfers in the register**
  (`the-register.md` C), and the target's shareholders are **paid**
- **A3** REASON — the consideration is **cash, shares, or both**, and the choice matters:
  - A3.a cash needs funding (`banks-lending.md`, `corporate-credit.md`) and increases the
    acquirer's leverage
  - A3.b shares dilute the acquirer's existing owners, which is a real cost to them
    (`equity.md` C)
- **A4** REASON — after it, the **two balance sheets combine**, and the combined firm is one party
  (`firm-fundamentals.md`)
- **A5** REASON — the target's **debt does not disappear**: it is repaid, assumed, or triggered by
  a change-of-control term (`../instruments/bond.md` N11)

### B. WHY AN ACQUIRER BIDS
- **B1** REASON — it thinks the target is **worth more to it** than the market price: cost
  savings, market position, an asset it wants
- **B2** REASON — the **premium is what it must pay** to get the owners to sell, and it is
  therefore a cleared price like any other (`the-clearing-engine.md`)
  - B2.a a target's owners can **refuse**, and a bid can fail — a real outcome with consequences
    for both prices
- **B3** REASON — it must be able to **fund it** (A3.a), so the credit market decides which deals
  happen — the same constraint as `private-equity.md` B2.b
- **B4** REASON — a **competing bidder** can appear, and then the price is contested, which is the
  auction working
- **B5** FORBID — **no deal by assignment.** A merger that happens because a rule said so has no
  bidder, no premium and no funding constraint

### C. WHY A TARGET'S OWNERS SELL
- **C1** REASON — the **price beats holding**, on their own valuation (`equity.md` D)
- **C2** REASON — they are **dispersed**, so each decides individually and the outcome is the
  aggregate of those decisions
- **C3** REASON — **management may resist**, and its interests differ from the owners' — which is
  the corporate-control problem and the reason takeovers discipline firms at all
- **C4** VERIFY — a firm trading cheap relative to what a buyer would pay should attract bids, as a
  consequence, and if it never does, the discipline channel is absent

### D. AFTER
- **D1** REASON — the combined firm's **cash flows are the sum**, plus whatever the acquirer
  claimed it could change — and whether that materialises is measurable
- **D2** REASON — the acquirer's **leverage is higher** if it paid cash, and its credit is
  reassessed (`ratings-and-assessment.md`)
  - D2.a which is why an acquirer's bonds can fall on the day its shares rise, and both are
    correct
- **D3** REASON — the target's **shares cease to exist** as a separate instrument
  (`the-register.md` B4), and any index containing them changes (`indices.md` B2)
- **D4** REASON — **employees, suppliers and customers** carry over to a different owner
  (`labour.md`, `trade-credit.md`)
- **D5** VERIFY — the money paid to target shareholders equals what the acquirer and its lenders
  put up, exactly, and it lands in named accounts

### E. WHAT MUST NOT HAPPEN
- **E1** FORBID — **no acquisition without payment.** Somebody was paid, from a real balance
- **E2** FORBID — **no target that disappears without its liabilities being addressed** (A5,
  `firm-birth-and-death.md` E2)
- **E3** FORBID — **no synergy that is assumed into the cash flows** without showing up in
  `firm-fundamentals.md` B as real revenue or real cost

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| **A1 an acquirer, a target, and a price the owners accept** | `src/engine/simulation/stages/10-mergers.ts:purchasePrice` | ⚠️ |
| A2 ownership transfers in the register; holders are paid | `src/engine/simulation/stages/10-mergers.ts:institutionalTenderLocal` | ✅ |
| A3 the consideration is cash, shares, or both | `src/engine/simulation/stages/10-mergers.ts:cashPaid` | ⚠️ |
| **A3.a cash needs funding and raises leverage** | — | ❌ |
| A3.b shares dilute the acquirer's existing owners | `src/engine/simulation/stages/10-mergers.ts:newShares` | ✅ |
| A4 the two balance sheets combine into one party | `src/engine/simulation/stages/10-mergers.ts:consolidateTranches` | ⚠️ |
| A5 the target's debt is repaid, assumed or triggered | `src/engine/simulation/stages/10-mergers.ts:rebuildLadder` | ⚠️ |
| B1 it thinks the target is worth more to it | `src/engine/simulation/merger.ts:checkForMerger` | ⚠️ |
| **B2 the premium is a cleared price** | `src/engine/simulation/stages/10-mergers.ts:purchasePrice` | ❌ |
| **B2.a the owners can refuse, and a bid can fail** | — | ❌ |
| **B3 the credit market decides which deals happen** | `src/engine/simulation/merger.ts:checkForMerger` | ❌ |
| **B4 a competing bidder can appear** | — | ❌ |
| **B5 FORBID no deal by assignment** | `src/engine/simulation/merger.ts:checkForMerger` | ❌ |
| **C1 the price beats holding, on the owners' valuation** | — | ❌ |
| **C2 dispersed owners each decide** | — | ❌ |
| **C3 management may resist** | — | ❌ |
| C4 a cheap firm should attract bids | `src/engine/simulation/merger.ts:isUndervalued` | ⚠️ |
| D1 the combined cash flows are the sum, plus the claim | `src/engine2/stage08-back.ts:newRevenue` | ⚠️ |
| D2 the acquirer's leverage rises and credit is reassessed | `src/engine2/stage08-back.ts:newLeverage` | ⚠️ |
| **D2.a bonds can fall on the day shares rise** | — | ❌ |
| D3 the target's shares cease to exist | `src/engine/simulation/stages/10-mergers.ts:stockRatio` | ✅ |
| D4 employees, suppliers and customers carry over | `src/engine/simulation/stages/10-mergers.ts:novateContracts` | ⚠️ |
| D5 the money paid equals what was put up | `src/engine/simulation/stages/10-mergers.ts:institutionalTenderLocal` | ✅ |
| E1 FORBID no acquisition without payment | `src/engine/simulation/stages/10-mergers.ts:pay` | ✅ |
| E2 FORBID no target that disappears with liabilities open | `src/engine/simulation/stages/10-mergers.ts:consolidateTranches` | ✅ |
| **E3 FORBID no synergy assumed into the cash flows** | `src/engine/simulation/stages/10-mergers.ts:runMergersStage` | ❌ |

---

## 3. THE DIFF

### ❌ B5 / B2 / B2.a / B3 / B4 / C1 / C2 / C3 — THERE IS NO M&A MARKET. THERE IS A COIN FLIP

`merger.ts:24` gates the whole system on `week % 13 !== 0`, walks the active firms, applies three
screens, and fires on `random() < 0.20`. It returns **at most one deal in the world per quarter**.
`10-mergers.ts:235` then prices it:

```
purchasePrice = marketCapOf(target) * 1.15
cashPaid = purchasePrice * 0.5
stockPaid = purchasePrice * 0.5
```

Every node in sections B and C is deleted by those five lines, and it is worth being precise about
which, because they are different absences:

- **B5** — the deal happens because a rule said so. There is a reason for the *pairing*
  (`isDistressed`, `isUndervalued`, or a measured supplier-reliability failure — these are real and
  well-built), but no reason for the *deal*: the same pair either fires or does not on a draw.
- **B2** — the premium is the constant `1.15`. It does not move with the target's business, with
  competition for it, with the acquirer's cost of funds or with anything at all. It is the single
  stated number this whole system rests on.
- **B2.a / C1 / C2 / C3** — the target's owners are never asked. `institutionalTenderLocal` pays every
  holder of record its pro-rata share of the cash leg and converts the rest to acquirer stock;
  no holder has a reservation price, none can decline, and there is no management to resist. A bid
  cannot fail, so a failed bid has no price consequence for either side.
- **B3** — the funding test is `cashOf(v2, acquirer) < 2 × totalDebtOf(acquirer)` → skip. That is a
  screen on the acquirer's own balance, not a lender's decision, and it is applied **before** the
  price is known. No bank is asked, no bond is issued, and `pay()` does not check a balance — so the
  acquirer's account simply goes to whatever it goes to.
- **B4** — the loop returns the first eligible pair it finds. Two acquirers can never want the same
  target.

The consequence is the one the tree's header names: equity in this world is a claim on a dividend
stream and not on control. A firm trading at half what a buyer would pay is not disciplined by
anything; it waits for a 20% quarterly coin flip. And because the premium is a constant, **the
takeover channel transmits no information into the equity price** — `marketCapOf(target) × 1.15`
means the deal price is an output of the equity market rather than an input to it.

**§3 step 37-MANDA**, . The
shape is the one the rest of the repo already uses: the acquirer forms a value, the holders of
record post reservations, `the-clearing-engine.md` clears the tender, and the funding leg goes
through the primary market like any other. `07e-equity-clearing.ts` and `primary-market.ts` are
most of the machinery.

### ❌ E3 / ⚠️ A4 — TWO SYNERGIES ARE ASSUMED STRAIGHT INTO THE COMBINED FIRM

`10-mergers.ts:293-294`:

```
acquirer.annualRevenue = acquirer.annualRevenue + target.annualRevenue * 0.85
acquirer.employeeCount += Math.round(target.employeeCount * 0.75)
```

E3 forbids exactly this: a synergy that does not show up in `firm-fundamentals.md` B as real revenue
or real cost. Both numbers are assumed, and they are opposite in sign — a 15% revenue dis-synergy and
a 25% headcount saving — with no stated reason for either.

They behave differently, and both are defects:

- The revenue haircut is **transient**: `annualRevenue` is overwritten every week by
  `stage08-back.ts:newRevenue`, an EMA toward measured cleared sales, so the 0.85 is a one-off level
  shock that decays over roughly a quarter. It still moves prices, ratings and capacity for those
  weeks, on a number nobody sold.
- The headcount saving is **permanent and has no destination**: a quarter of the target's employees
  cease to exist in a single statement. They never enter `separationsByOcc`, no household is
  affected, and the region's employment view simply prints a smaller number next week. That is the
  same defect `firm-birth-and-death.md` D4 records for a death, in the one place where the tree
  explicitly says the people carry over (D4).

**§3 step 37-MANDA** — the same one as B5's; a real deal's cost savings are a decision the combined
firm then makes through `labor-demand.ts:employerWeekPosting`, and its revenue is whatever it clears.

### ❌ A3.a / D2.a — A CASH ACQUISITION IS NOT FUNDED

The cash half of the consideration is paid out of the acquirer's account and nothing is raised
against it. So A3.a's "cash needs funding and increases the acquirer's leverage" is half-true by
accident: total debt does rise, because the target's ladder is assumed (`consolidateTranches`), but
**not because the acquirer borrowed to pay**. The credit consequence of a leveraged acquisition —
the thing that makes M&A a large use of the credit market, and the reason `private-equity.md` B2.b
is the same constraint — is absent, and with it D2.a's measurable disagreement between the two
markets on the day of a deal.

Both fall out of B3's step. D2.a itself is **a measurement, for §3 step 38** once B3 exists.

### ⚠️ A5 — THE DEBT IS ASSUMED, ALWAYS, AND NO TERM SAYS SO

`consolidateTranches` merges the two ladders by (rate type, 5-year tenor bucket, call protection,
seniority, facility lender, CP flag), which is careful work and preserves the instruments' identity.
But assumption is the only outcome available: A5's other two — repaid at the deal, or **triggered by
a change-of-control term** — do not exist, because `DebtTranche` carries no covenants (**already §3
step 34**). A change-of-control put is the term that makes a bondholder a party to a takeover; today
they are a spectator whose paper is re-keyed.

### ⚠️ C4 / B1 — THE SCREENS ARE REAL AND THE VALUATION IS NOT

Credit where it is due: three of the four reasons a bid exists here are measured, not stated.
`isDistressed` reads the target's own rating, leverage and coverage; `isUndervalued` is
`marketCap < annualRevenue × 0.4`; and the vertical-integration path reads `deliveryReliability`,
a slow volume-weighted EMA of the acquirer's own short-shipment experience, which is a genuinely
good mechanism and the kind of thing this atlas exists to find working.

What is missing is B1 itself: nowhere does the acquirer form **what the target is worth to it**.
`0.4 × revenue` is a stated cheapness threshold, not a valuation, and it means C4's verify
("a firm trading cheap relative to what a buyer would pay should attract bids") cannot be measured —
there is no "what a buyer would pay" in the model. Falls out of B5's step.

### ⚠️ D4 — WHAT CARRIES OVER, AND WHAT DOES NOT

Contracts, consignments, bank links, derivative books and the whole bank balance sheet all novate
properly (`novateContracts`, `reassignConsignments`, `rekeyBankLinks`, `mergeBankSheets`) — this is
the most complete part of the stage. Customers and suppliers therefore carry over. Employees do not
(E3 above). Trade receivables against the target carry over because the invoice book names the buyer
by id and the target's id leaves `isActiveCompany` — which means `trade-settlement.ts:53`
**writes off** every invoice a supplier had against an acquired firm as if it had died. That is a
real bug in this tree's D4: an acquisition is not a default, and its suppliers should be paid.
Small; is **§3 step 37-SMALL** (the write-off test must distinguish `isDefaulted` from
`mergerAcquired`, which `isActiveCompany` deliberately conflates).

### ✅ A2 / D5 / E1 / E2 — THE MONEY AND THE REGISTER ARE RIGHT

The consideration moves as real payments between named accounts: acquirer → target → each
institutional holder pro rata to its stake, with the residual to the region's household sector, and
the stock leg converts each target equity row into acquirer shares by two wires (retire, issue)
rather than a re-key. The target's ladder is rebuilt to empty and the acquirer's carries the face.
`D5`'s identity holds by construction. This half of the system is real; it is the deciding half that
does not exist.

### Also marked, briefly

- **A1 ⚠️** — acquirer and target are real; the price is `marketCap × 1.15`, accepted by nobody — B2.
- **A3 ⚠️** — cash and stock, always half each.
- **D1 ⚠️** — the combined revenue is an EMA toward measured sales after a one-off `× 0.85` — E3.
- **D2 ⚠️** — leverage rises because the target's ladder is assumed, never because the acquirer borrowed — A3.a.
