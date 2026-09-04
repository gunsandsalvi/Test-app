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
    the unit travels with the number (rule 8)
- **A2** REASON — a holding is a **claim on a named issuer**, not a token
  - A2.a everything the instrument pays, it pays to whoever the register says holds it, then
- **A3** FORBID — **no holding without a holder.** A residual position on nobody is a defect
  (rule 2), not a rounding line
- **A4** FORBID — **no holding without an issuer.** A claim on a party that never issued it is
  money invented in the ownership dimension

### B. THE ISSUER SIDE
- **B1** REASON — an instrument has an **issued amount**, set when it was issued and changed only
  by an issuance, a buyback, an amortisation or a maturity
- **B2** VERIFY — **Σ holdings = issued amount**, per instrument, always
  - B2.a a shortfall means somebody's claim vanished; a surplus means somebody's was invented
  - B2.b the tolerance is float dust, never a fraction of the issue (rule 7)
- **B3** REASON — the issuer's **liability** is the same number read from the other side, never a
  second stored copy (rule 4)
- **B4** REASON — an instrument **ceases** — matures, is redeemed, defaults into a recovery — and
  when it does every holding in it resolves to something else, named

### C. TRANSFER
- **C1** REASON — ownership changes only by a **transfer with two named sides**: seller loses
  exactly what buyer gains (rule 5, both legs in one pass)
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

---

## 2. THE MAPPING

Mapped 2026-09-03. `✅` present · `⚠️` present but diverging · `❌` absent. Every citation is
checked by `scripts/check-atlas.sh`.

| Node | Code | |
|---|---|---|
| A1 a holding is holder + instrument + quantity | `src/engine2/holdings.ts:HoldingStore` · `src/domain/banking.ts:ItemizedHolding` | ✅ |
| A1.a the holder exists and can be paid | `src/engine/ledger/holdings-ledger.ts:holderIdOf` | ⚠️ |
| A1.b the instrument is one the issuer issued | `src/engine/audit/ownership.ts:auditOwnership` | ⚠️ |
| A1.c the quantity is in the instrument's own unit | `src/engine2/holdings.ts:HoldingStore` | ✅ |
| A2 a holding is a claim on a named issuer | `src/engine2/holdings.ts:pushBookRow` | ✅ |
| A2.a it pays to whoever the register says holds it, then | `src/engine/simulation/stages/shared-helpers.ts:applyHolderInterestAccruals` | ✅ |
| A4 · the seed's half: every opening row names its issuer | `src/engine/ledger/holdings-ledger.ts:issuerOfHoldingRow` · `src/domain/entity-keys.ts:governmentEntityId` | ✅ |
| **A3 FORBID no holding without a holder** | `src/engine2/holdings.ts:bookHeadOf` | ✅ |
| **A4 FORBID no holding without an issuer** | `src/engine/audit/ownership.ts:auditOwnership` | ⚠️ |
| B1 an instrument has an issued amount | `src/engine/ledger/tranche-ledger.ts:issueTranche` | ✅ |
| B2 VERIFY Σ holdings = issued amount, per instrument | `src/engine/audit/ownership.ts:auditOwnership` | ⚠️ |
| B2.a shortfall = a claim vanished; surplus = one invented | `src/engine/audit/ownership.ts:auditOwnership` | ✅ |
| **B2.b the tolerance is float dust, never a fraction of the issue** | `src/domain/stated.ts:AUDIT_BOOKS_TOLERANCE` | ❌ |
| B3 the issuer's liability is a read of the other side | `src/domain/company.ts:totalDebtOf` | ✅ |
| B4 an instrument ceases and every holding resolves | `src/engine/ledger/holdings-ledger.ts:retireHolding` | ✅ |
| C1 ownership changes only by a transfer with two named sides | `src/engine/ledger/holdings-ledger.ts:transferHolding` | ✅ |
| C2 a transfer has a cause | `src/engine/ledger/wire.ts:WireInstruction` | ✅ |
| C2.a …and a price, if it is a trade | `src/engine/ledger/holdings-ledger.ts:priceOf` | ✅ |
| **C3 the securities leg and the cash leg are the same event** | `src/engine/simulation/stages/book-settlement.ts:settleClearedBook` | ⚠️ |
| **C3.a delivery versus payment: neither leg without the other** | `src/engine/simulation/stages/book-settlement.ts:settleClearedBook` | ❌ |
| **C3.b a fail is a real state, not a silent half-settlement** | — | ❌ |
| **C4 FORBID no short by accident** | `src/engine/ledger/holdings-ledger.ts:debitRow` | ✅ |
| C5 VERIFY Σ bought = Σ sold, instrument by instrument | `src/engine/audit/wires.ts:auditWires` | ✅ |
| D1 what does this party hold? | `src/engine2/holdings.ts:bookRowsOf` | ✅ |
| **D2 who holds this instrument?** | — | ❌ |
| D2.a both directions answerable without reconstruction | `src/engine2/holdings.ts:bookRowsOf` | ⚠️ |
| D3 what is it worth? — quantity × a market price | `src/engine/ledger/holdings-ledger.ts:markBookToMarket` | ✅ |
| **D4 what did it cost? — the basis** | — | ❌ |
| E1 a coupon or dividend pays the holders of record | `src/engine/simulation/stages/shared-helpers.ts:applyHolderInterestAccruals` · `src/engine/columns/holdings-table.ts:buildFromRows` · `src/engine/simulation/stages/register-index.ts:bumpRegister` | ✅ |
| E2 an amortisation or maturity pays its face | `src/engine/simulation/stages/07f-short-debt-clearing.ts:runShortDebtClearingStage` | ✅ |
| E3 a default converts the holding into a recovery claim | `src/engine/simulation/stages/estate-resolution.ts:runEstateResolutionStage` | ✅ |
| E4 a split, buyback or new issue moves both sides at once | `src/engine/ledger/holdings-ledger.ts:scaleHoldings` | ✅ |
| E5 VERIFY every register event moves money or says why not | `src/engine/ledger/holdings-ledger.ts:markHolding` | ✅ |
| F1 an instrument has a stable identity for its whole life | `src/domain/ids.ts:InstrumentId` · `src/engine2/refs.ts:RefColumn` | ⚠️ |
| F1.a two instruments with the same terms are still two | `src/domain/instrument-keys.ts:corporateTrancheId` | ⚠️ |
| F2 a dead party leaves its holdings to a named successor | `src/engine/simulation/stages/estate-resolution.ts:runEstateResolutionStage` | ✅ |
| F3 VERIFY the register survives a week boundary unchanged | `src/engine/audit/wires.ts:auditWires` · `src/engine/audit/snapshot.ts:registerQtyByKind` | ✅ |

---

## 3. THE DIFF

### ⚠️ A1.b — O3 EXEMPTS A FUND SHARE WHOSE FUND IS GONE (found at §9.13-BOOK c-then-1)

The register keys a fund's shares by the **FUND'S OWN ENTITY ID** — `etfShareRegisterId` is the
identity function, and `peFundInterestId` is the same — which is the two-keys conflation slice (a)
found, seen from the other side. `audit/ownership.ts:o3` therefore passes any row whose instrument
id resolves to an institution, and that line is right: a live fund share is not an orphan. Naming
the crossing (`etfShareFundId`) made the NEXT line legible, and it is the finding:

```
if (ent.get(etfShareFundId(h.instrumentId))) return;                              // fund alive
if (h.instrumentType === 'PE_FUND_INTEREST' || h.instrumentType === 'ETF_SHARE') return;
```

Both types are entity-id-keyed, so the first line already passes every fund share whose fund still
exists. **The second line passes exactly the rest — a share of a fund that no longer exists**,
which is the orphan A1.b asks O3 to find. Left as it stands (rule 11); it closes with slice (d),
which deletes one of the ETF share's two keys and gives the row an instrument to be checked
against.

### ❌ C3.a / C3.b — DELIVERY AND PAYMENT ARE TWO EVENTS, AND THE PAPER LEG IS THE LARGER ONE

The two legs of a cleared trade are written in different stages of the week and are not tied
together. The securities leg is wired at `holdings-writeback` (`core.ts:292`), inside
`HoldingsStore.finalize` → `clearedBookDelta`; the cash leg is a `pay()` row that does not settle
until `settlement` (`core.ts:308`). Between them the register has moved and no money has.

That is survivable on its own — one pass, one week. What is not is the primary leg, where the code
states the asymmetry outright. `book-settlement.ts:89`:

```
const primaryLocal = Math.max(0, Math.min(takeTotalLocal, Math.max(0, tradingLocal)));
```

…and then, ten lines later, the paper moves for the **whole** take, with the reason given in the
comment: *"the money above is what the CCP could pay; the paper placed is what the book took"*
(`book-settlement.ts:97-100`). When the dealer's trading residual comes up short of what the
participants actually took, the issuer delivers all the paper and is paid less than all the money,
and the shortfall is absorbed silently — `leftoverLocal` (line 106) is zero in exactly that case, so
the defect guard beneath it cannot fire.

**Consequence.** DvP is the property that makes a settlement fail *representable*: if neither leg
can happen without the other, a party that cannot pay does not get the paper, and that is the
event `trade-credit`, `securities-lending` and every counterparty-risk mechanism is built on.
Here the paper always arrives, so there is no such event anywhere in the model — C3.b has no code
because there is nothing for it to describe. It is the ownership-side twin of
`money-and-settlement.md` E1.

**§3 step 37-DVP**, . Medium: the two legs already exist and already name the same parties; what
is missing is one settlement point that writes both or neither.

### ⚠️ F1 — THE KEYING SIDE IS CLOSED: NINE REF COLUMNS, SEVEN SPACES, SEVEN NUMBERINGS

A columnar store cannot hold a string, so every string a row names is an integer into an intern
table: `H.instrRef`, `H.typeRef`, `H.regionRef`, `TS.idRef`, `TS.issuerRef`, `TS.bankRef`,
`A.keyRef`, `T.supplierRef`, `T.customerRef`, `L.sellerId`. All ten indexed ONE array, so they were
one numbering and the only thing keeping an instrument ref out of a region column was that the
columns had different names — a cross-space comparison compiled, ran, and answered wrongly without
a symptom, because a ref of the wrong space still decoded to a real string.

§3.13-BOOK slice (b) closed it in three steps, in that order:

1. **The spaces became types** (`engine2/refs.ts`), riding through the subscript via `RefColumn<B>`
   — a brand on the intern function alone dies at the first read, so the COLUMN type is what
   carries it. Numbering untouched: nothing could move.
2. **The 78 sites that reached past the doors were routed through them**, still on the shared
   table, so the whole intern table ended up behind fifteen functions in `world.ts`.
3. **Each space got its own table.** Seven numberings; a ref is meaningless outside the space that
   minted it, at runtime as well as at compile time.

`test/ref-spaces.test.ts` holds the runtime half, which a type check cannot: that the tables are
independent, that the same string in two spaces is two refs, that a read never appends, and that
`NO_REF` ("never interned") is a different integer from `ABSENT_REF` ("this row names nothing") —
they were the same, and the collision was unreachable only because freed rows are unlinked from
their chains.

**What this unlocks.** `refs.instruments.strings` IS the list of every instrument the world has
named. Under one table that question had no answer — ~15 type tags and 5 region codes sat mixed
among thousands of ids — and it is the question slice (d)'s instrument index is built on.

F1 stays `⚠️` overall for the reason below, which is about a key, not about the spaces.

### ⚠️ A4 — THE SEED'S HALF IS CLOSED: EVERY OPENING CREDIT ROW NAMED AN ISSUER THAT DOES NOT EXIST

A4 forbids a holding without an issuer. The seed opens every institution's book by wiring each
holding FROM its issuer, and it found that issuer by looking the row's `instrumentId` up in a map
keyed by COMPANY id. That worked while a corporate bond's row named its company. It stopped at
§9.13-CREDIT row 1, when those rows began naming a TRANCHE: `corporateTrancheId` builds `ACME-T1`,
`companyEntityId` builds `USA_ACME`, and the two are never equal — so the lookup could not hit, and
**every seeded corporate-bond and leveraged-loan row was issued from `{ INSTITUTION, id:
'<trancheId>' }`**, a party with no entity behind it, interned into the party table and wired from.

Both seed paths carried the rule, written out twice and identically — including the comment
asserting the thing that had become false. They are one function now
(`holdings-ledger.ts:issuerOfHoldingRow`), which asks `issuerIdOf` instead of assuming: a tranche
resolves to its issuer, and anything that is not a tranche is its own issuer, so equity and fund
shares resolve exactly as before. `test/seed-issuer.test.ts` pins both halves and fails without the
fix.

**How it hid.** Two copies of a rule are two places for it to rot, and these rotted together — and
`O8`, which checks that parties are alive, read the derivatives book alone, so nothing was looking.
*(§3.13-BOOK c-then-4: it walks every party-keyed store now — derivative contracts, repo book,
prime-brokerage lines, estate claims, invoices, consignments, both accrual ledgers, and the
account store's own party table — through one `partyExists` over the entity index, a line per
store. This is the check that would have caught the seeded-issuer defect above on week 1.)*

### ⚠️ F1 / F1.a — ONE INSTRUMENT, TWO KEYS: THE ETF SHARE

§3.13-BOOK slice (a) gave the register three nominal id spaces (`domain/ids.ts`: `EntityId`,
`InstrumentId`, `Ticker`) and put the whole instrument-key grammar in one file
(`domain/instrument-keys.ts`), so a key can no longer be invented at a call site and the compiler
refuses one space where another belongs. That is what re-marks F1 off `issueTranche`: identity is
now a property of the id, not of the stage that happened to mint it.

It also found what a comment could not. **`etf-flows.ts` clears a fund's shares under
`ETFSHARE-<fund>` and writes the resulting positions under the fund's own ENTITY id.** The
register's index, its weekly re-mark, and every holder's row use the second; the clearing book and
its price use the first. One instrument, two keys — and nothing has broken only because no code has
yet tried to join them. `banking.ts` has carried the sentence *"for ETF_SHARE: the fund entity's
id"* in a field comment for the life of that field, and a comment cannot fail a build.

Slice (a) deliberately did NOT unify them: these keys are persisted in the register, so changing
one is a data migration, not a rename. Both are now named constructors — `etfShareInstrumentId`
and `etfShareRegisterId` — sitting next to each other in one file, so the split is countable and
slice (d) deletes one of them.

F1.a drops to `⚠️` for the same reason: the grammar makes two same-terms instruments distinct
wherever it is used, and the ETF pair is where it is not.

### ❌ D4 — NOTHING RECORDS WHAT A POSITION COST

`ItemizedHolding` (`domain/banking.ts:28-56`) carries `quantityOrNotionalLocal`, `quantityShares`,
`units` and `faceLocal`. There is no basis field, and `grep -rn 'costBasis\|basis\|realizedGain'`
over `src/` returns nothing. The doc comment on `quantityOrNotionalLocal` even says *"market value
at cost"* — two different quantities named as one, which is how the field came to be re-marked
every week by `markBookToMarket` without anybody noticing the cost was gone.

**Consequence.** A realised gain cannot be computed, so it cannot be taxed and cannot be reported.
`the-treasury.md` C1 wants taxes on real bases; a capital-gains base does not exist here. It also
means a fund's P&L cannot separate what it earned from what it was handed by a re-mark.

**§3 step 37-DVP**, . Small on the register (one column, written where a row is credited),
larger where it lands (the tax base, the P&L split).

### ❌ B2.b — THE HELD-EQUALS-ISSUED CHECK FORGIVES 2% OF THE ISSUE

`audit/ownership.ts:59` fires O1 only when `|held − outstanding| > max(5e7, outstanding × 0.02)`,
with `AUDIT_BOOKS_TOLERANCE = 0.02` declared as a RESOLUTION in `domain/stated.ts:114-119`. O6 is
the same shape at `max(1e7, issued × 0.02)`. B2.b names this exactly: *"the tolerance is float
dust, never a fraction of the issue (rule 7)"*. On a corporate book of hundreds of billions, 2%
is tens of billions of paper that may be held by nobody or claimed twice, per region per kind, and
the check will not say so.

The registry entry's own reason — *"the test is invariance to the tolerance, not its value"* —
concedes the point: nothing measures that invariance.

**Already §3 step 27** (the audit's percentage bands). Second witness, and the sharpest one: this
is the band on the register's own defining identity.

### ✅ C2.a / D3 / A1.c — CLOSED: THE REGISTER STORES THE QUANTITY AND THE VALUE IS A READ

`holdings-ledger.ts:priceOf` returned `{quantity: value, price: 1}` for any row that carried
neither shares nor a face — which was EVERY credit row, because the field meant to carry the face
(`faceLocal`) had no lane in the columnar store and was dropped at the week's materialisation. So a
corporate bond transfer wired at par by construction and `clearedBookDelta`'s credit branch
computed a money delta with no price at all.

**§9.13-CREDIT row 5 closed all three.** `faceLocal` is deleted and `units` is the one quantity, in
the instrument's own unit (A1.c) — shares for equity, FACE for credit and sovereigns. Every writer
maintains it: `newBookRow` (the clearing write-back's own row builder, which never copied it),
`debitRow` (which never subtracted it), the duplicate-row merge, `addShares`, `scaleHoldings`, the
estate and the merger paths. `clearedBookDelta` takes a UNIT delta and prices it, so a wire carries
what moved and what it fetched (C2.a). And `register-marking` is WIRED IN, at the close, after every
stage that can write a row: a credit row's value is `units × the price that paper's own auction
printed` (D3), and the books go on claiming `units`, so a mark never looks like a trade.

### ❌ D2 — THE HOLDER SIDE IS INDEXED; THE INSTRUMENT SIDE IS A SCAN

This node read ✅ against `HoldingsTable`, and §3.13-READ B1 showed that mark was resting on
unreachable code. The table had two builders: `build()`, which read the `itemizedHoldings` object
arrays and maintained a by-instrument transpose, and `buildFromRows`, which reads the persistent
row mirror and deliberately skips it — `rowsOfInstrument` THREW if a caller asked for the transpose
on the row path, and said so in its own message. `build()`'s only entry point checks `ctx.v2`,
which is a required field of `WeeklyStepContext`, so the row path was always taken and the
transpose was never built. The one direction this tree calls D2 was answerable only by a builder
nothing could reach.

**What is true instead:** the store keeps per-entity chains (`H.head`/`H.next`), so D1 — "what does
this party hold" — is a walk of one chain. "Who holds this instrument" has no index at all: every
caller that needs it scans `0..used` filtering on `H.instrRef`, or walks every holder's chain. The
audit does exactly that, as do the ETF creation basket and the estate walk. It is correct and it is
O(register) per question.

D2.a drops to ⚠️ with it: the two directions are no longer symmetric, and the honest citation is
the chain walk rather than an index that answers both. Nothing RECONSTRUCTS the register — that
half of D2.a, which is what its diff entry below is about, is still closed.

### ✅ D2.a / F1.a — CLOSED: NO BOOK CLEARS BY ISSUER, AND NOTHING RECONSTRUCTS THE REGISTER

What stood here was `register-split.ts:splitAcrossTranches`: it took a holder's fill in an ISSUER
and spread it across that issuer's live tranches of the kind, pro rata to face. Which specific bond
a buyer bought was therefore not a fact of the trade — it was an allocation applied afterwards, and
it changed every week as the ladder changed. D2.a's warning ("a reconstruction drifts") was
literal, and the fallback booked the position under the ISSUER's own id when no tranche of the kind
was live, which is what `O8` counted.

**§9.13-CREDIT rows 1, 3 and 4 closed it, one book at a time** — bonds, leveraged loans, then
commercial paper. Every credit book prices the PAPER, so a fill already names what it bought,
a claim on a tranche that has retired is repaid by its borrower rather than migrated onto that
borrower's other paper, and `register-split.ts` is DELETED. Row 4 also removed the same roll-up on
the desks' side (`dealer-desks.ts:priorPositions`), which had outlived the books it was written for
and was handing each per-tranche session a desk that declared itself flat.

Sovereigns were worse in the same direction — the holding was a tenor BUCKET, so every gilt of the
same tenor was one instrument and F1.a was false by construction. §3.13-SOV row 3 closed that: a
sovereign holding is a row naming a tranche, in the same store and the same id space as the rest.

### ✅ F3 / A1 — CLOSED: THE ROWS ARE THE REGISTER, AND THERE IS NO SECOND COPY TO CHECK AGAINST

`engine2/holdings.ts` called itself *"Stage 1: a SYNCED MIRROR"* of `entity.itemizedHoldings` —
two representations, kept in step by `syncBookRows` at every writer and compared by
`assertBooksInSync` behind `HOLDINGS_SYNC_CHECK=1`, which is what F3 cited. §9.13-BOOK d1 deleted
the mirror: the rows are the register, the seed opens every book by wire (`seedBook`, A4), the
array is the week-end view `core.ts` materialises and nothing in a week reads, and the clearing
store builds its opening book from `materializeBook` rather than pairing the array against the
chain by position. F3's check is now W5 — the register's change per asset kind is the replay of
the week's wires, in units — which is the stronger statement: not "the copy agrees" but "nothing
moved without a wire".

### ✅ C4 — NO SHORT BY ACCIDENT, AND IT IS ENFORCED TWICE

Worth recording as a clean pass because it is the node most likely to be assumed rather than
checked. `holdings-ledger.ts:debitRow` (line 138) defects when the walk leaves more than float
noise undelivered, with the residue scaled to the position walked rather than to the amount asked
for; `holdings-store.ts:addShares` defects on the same condition for the stock-loan delivery path
that writes rows directly. The clearing kernel cannot produce a negative fill either —
`filledLocal = max(core, min(wanted, affordable))` with all three non-negative
(`financial-clearing-engine.ts:812`). A deliberate short exists only as a borrowed position in
`securities-lending`, which is what the node asks for.

### ⚠️ A1.a / A4 — TWO NODES THAT ARE CHECKS RATHER THAN CONSTRUCTIONS

`holderIdOf` returns a holder id only for `INSTITUTION`, so a company's treasury book, a bank's
sovereign book and a household's equity are held OUTSIDE this register in fields on their own
sheets — the register is the institutions'. The O-family checks then reconcile those other stores
against the ladders (O1, O6, O7) rather than the register doing it by construction. Not a defect
of this tree so much as a statement of its true boundary; recorded so the next reader does not
assume `A1` covers every holder in the world.

### Also marked, briefly

- **B2 ⚠️** — `O1` holds the identity at a 2% band — B2.b.
- **C3 ⚠️** — the paper leg and the cash leg are two stages apart — C3.a/C3.b, 37-DVP.
