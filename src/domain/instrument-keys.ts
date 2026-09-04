/**
 * §3.13-BOOK slice (a) — THE INSTRUMENT KEY GRAMMAR, IN ONE PLACE.
 *
 * An instrument that is not a row in a store still needs an id: a swap tenor, an FX pair, a repo
 * book, a futures contract, an ETF share class. Each of those ids was built by a template literal
 * inside the adapter that cleared it, which meant the grammar of the whole id space existed only
 * as ~a dozen backticks scattered across `stages/`. Nothing could enumerate it, nothing could
 * check two families did not collide, and nothing stopped a reader inventing a thirteenth shape.
 *
 * So every family gets a named constructor here, returning `InstrumentId`. Three consequences:
 *
 *   1. **The ids are unchanged.** Each function reproduces its adapter's template byte for byte.
 *      These keys are PERSISTED — in the register, in the price table, in desk inventories — so a
 *      changed key is a silent data migration, not a rename. Slice (a) moves no data.
 *   2. **`asInstrumentId` disappears from the adapters.** The mint is here, once per family, and
 *      `ids.ts`'s count of unproven admissions falls to the number of FAMILIES rather than the
 *      number of call sites.
 *   3. **Slice (d) has something to collapse.** The four taxonomies it has to merge are visible
 *      here as the four different shapes below; a reader can see that `FX-` and `XCS-` are the
 *      same pair under two books, and that equity has no prefix at all.
 *
 * THE ONE THAT IS NOT A GRAMMAR. `equityInstrumentId` returns the company's own id, verbatim: a
 * company's listed equity is keyed by the issuer that issued it. That is a real collision between
 * the ENTITY space and the INSTRUMENT space — `Map<InstrumentId, …>.get(company.id)` and
 * `Map<EntityId, …>.get(company.id)` both hit — and it is exactly the kind of thing slice (e)'s
 * one position book has to end. Naming it does not fix it. It makes it COUNTABLE: every crossing
 * of that boundary is now a call to this function, and `grep -c equityInstrumentId` is the size
 * of the job.
 */

import { asInstrumentId, type InstrumentId } from './ids';
import type { RegionId } from './geography';

/**
 * A company's listed equity. The id IS the issuer's id — see the header: this is the crossing,
 * not a fix for it. Callers pass the company id they already hold.
 */
export const equityInstrumentId = (companyId: string): InstrumentId => asInstrumentId(companyId);

/** One region's single-name credit default swap on one reference issuer. */
export const cdsInstrumentId = (regionId: RegionId, issuerId: string): InstrumentId =>
  asInstrumentId(`${regionId}-CDS-${issuerId}`);

/** One region's par interest-rate swap at one of the three quoted tenors. */
export const swapInstrumentId = (regionId: RegionId, tenorKey: string): InstrumentId =>
  asInstrumentId(`${regionId}-IRS-${tenorKey}`);

/** Spot FX for one ordered pair, as `fx-clearing` books it. */
export const fxSpotInstrumentId = (pairKey: string): InstrumentId => asInstrumentId(`FX-${pairKey}`);

/**
 * The cross-currency basis book for one holder-region/issuer-region pair. A different book from
 * the spot pair above and deliberately a different key: the basis is a term funding price, not a
 * rate, and they clear against different participants.
 */
export const fxBasisInstrumentId = (pairKey: string): InstrumentId => asInstrumentId(`XCS-${pairKey}`);

/** One commodity's futures contract at one delivery tenor, in whole months. */
export const commodityFutureInstrumentId = (commodityId: string, tenorMonths: number): InstrumentId =>
  asInstrumentId(`FUT-${commodityId}-${tenorMonths}M`);

/**
 * A fund's share class AS THE CLEARING BOOK NAMES IT.
 *
 * **This does not agree with the register, and slice (a) found that out rather than assuming it.**
 * `etf-flows.ts` clears the fund's shares under `ETFSHARE-<fund>` and writes the resulting
 * positions under the FUND'S OWN ENTITY ID (`etfShareRegisterId` below) — the register's index,
 * its re-mark, and every holder's row all use the second. One instrument, two keys, and the only
 * reason nothing has broken is that no code has yet tried to join the two.
 *
 * Which is the point of a global book: `banking.ts` has said "for ETF_SHARE: the fund entity's id"
 * in a comment for the whole life of the field, and a comment cannot fail. This pair can — slice
 * (d) deletes one of them, and until it does, every crossing is one of these two calls.
 */
export const etfShareInstrumentId = (fundId: string): InstrumentId => asInstrumentId(`ETFSHARE-${fundId}`);

/**
 * The same share class AS THE REGISTER NAMES IT: the fund's entity id, verbatim. See the note on
 * `etfShareInstrumentId` — this is the second of the two keys, not a second instrument.
 */
export const etfShareRegisterId = (fundId: string): InstrumentId => asInstrumentId(fundId);

/** One region's overnight repo book: a single instrument whose price is the overnight rate. */
export const repoOvernightInstrumentId = (regionId: RegionId): InstrumentId =>
  asInstrumentId(`${regionId}-REPO-ON`);

/** One region's term repo book — the three-month leg of the same market. */
export const repoTermInstrumentId = (regionId: RegionId): InstrumentId =>
  asInstrumentId(`${regionId}-REPO-TERM`);

/**
 * One rung of a company's debt ladder. The rung number is 1-based and stable for the life of the
 * ladder; `tranche-ledger.ts` is the only writer of the rows this keys.
 */
export const corporateTrancheId = (ticker: string, rung: number): InstrumentId =>
  asInstrumentId(`${ticker}-T${rung}`);

/**
 * The bridge a company draws to fund the maintenance capex its cash flow could not — a real
 * tranche on a real bank's book, and priced wide because that is what a bridge costs.
 */
export const maintenanceBridgeTrancheId = (ticker: string, week: number): InstrumentId =>
  asInstrumentId(`${ticker}-MAINT-${week}`);

/** A revolver draw taken because the borrower ran out of cash this week. */
export const liquidityRevolverTrancheId = (companyId: string, week: number): InstrumentId =>
  asInstrumentId(`${companyId}-REVOLVER-LIQ-${week}`);

/** A revolver draw taken because a maturity came due and the market would not refinance it. */
export const maturityRevolverTrancheId = (companyId: string, week: number): InstrumentId =>
  asInstrumentId(`${companyId}-REVOLVER-${week}`);

/**
 * The replacement a called tranche becomes. It carries the CALLED tranche's id inside its own, so
 * the holders-of-record replacement (`pendingHolderReplacements`) can be read back to the paper it
 * came from without a second table.
 */
export const calledRefinanceTrancheId = (companyId: string, week: number, calledId: string): InstrumentId =>
  asInstrumentId(`${companyId}-CALL-${week}-${calledId}`);

/** One week's commercial-paper issue by one borrower — short, unsecured, and its own tranche. */
export const commercialPaperTrancheId = (ticker: string, week: number): InstrumentId =>
  asInstrumentId(`${ticker}-CP-${week}`);

/**
 * A bucket of the acquirer's assumed debt: several tranches of the target's ladder, close enough
 * in rate type and maturity to be one rung, consolidated into one piece of paper. `bucketIndex`
 * disambiguates the buckets struck in the same week.
 */
export const assumedDebtTrancheId = (idPrefix: string, week: number, bucketIndex: number): InstrumentId =>
  asInstrumentId(`${idPrefix}-ASSUMED-${week}-${bucketIndex}`);

/**
 * A target tranche that has become the acquirer's. The OLD id stays inside the new one: the paper
 * did not cease to exist, it changed obligor, and its lineage is the only record of that.
 */
export const acquiredTrancheId = (acquirerTicker: string, week: number, oldId: string): InstrumentId =>
  asInstrumentId(`${acquirerTicker}-ACQ${week}-${oldId}`);

/** One region's stock-borrow book on one name: its price is the borrow fee, not the share price. */
export const sblInstrumentId = (regionId: RegionId, companyId: string): InstrumentId =>
  asInstrumentId(`${regionId}-SBL-${companyId}`);

/**
 * A private-equity fund's own interest — what a limited partner holds. The FUND is an entity and
 * this is the paper that entity issues; they are two ids, which is the distinction fund shares
 * used to lose by reusing the holder's own entity id (`ids.ts` header).
 */
export const peFundInterestId = (regionId: RegionId, fundIndex: number): InstrumentId =>
  asInstrumentId(`${regionId}_PEFUND_${fundIndex}`);

/**
 * The facility draw an overdraft is converted into. `suffix` distinguishes the two sweeps that
 * can strike one in the same week — the corporate sweep and the diversification pass — because
 * two rungs struck on one week under one key would silently be one rung.
 */
export const overdraftFacilityTrancheId = (companyId: string, week: number, suffix = ''): InstrumentId =>
  asInstrumentId(`${companyId}-REVOLVER-OD-${week}${suffix}`);

/** The facility a company is born owing — the debt half of a sponsor's capital structure. */
export const birthFacilityTrancheId = (companyId: string, week: number): InstrumentId =>
  asInstrumentId(`${companyId}-FACILITY-BIRTH-${week}`);
