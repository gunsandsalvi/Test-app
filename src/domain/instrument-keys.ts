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

import { asInstrumentId, asEntityId, type InstrumentId, type EntityId } from './ids';
import type { RegionId } from './geography';
import { peFundEntityId } from './entity-keys';
import type { Ticker } from './ids';

/**
 * A company's listed equity. The id IS the issuer's id — see the header: this is the crossing,
 * not a fix for it. Callers pass the company id they already hold.
 */
export const equityInstrumentId = (companyId: string): InstrumentId => asInstrumentId(companyId);

/**
 * §3.13-BOOK slice (c2a) — THE SAME CROSSING, READ THE OTHER WAY. Branding `Company.id` made the
 * return direction visible too: four sites take an instrument id off a register row and ask a map
 * keyed by COMPANY id about it, which is the identical collision seen from the other side and was
 * previously invisible because both were `string`. Naming it does not fix it either — slice (e)'s
 * one position book does — but `grep -c equityIssuerId` now counts the return legs the way
 * `equityInstrumentId` counts the outbound ones.
 *
 * The caller must already know the instrument IS a listed equity. Nothing here can check that: on
 * this side of slice (d) there is no instrument registry to ask.
 */
export const equityIssuerId = (instrumentId: InstrumentId): EntityId => asEntityId(instrumentId);

/** One region's single-name credit default swap on one reference issuer at one tenor (§3.17d-iii). */
export const cdsInstrumentId = (regionId: RegionId, issuerId: string, termKey: string): InstrumentId =>
  asInstrumentId(`${regionId}-CDS-${issuerId}-${termKey}`);

/** §3.17d-ii — one credit index SERIES as the line it clears on (the series id names its region). */
export const creditIndexInstrumentId = (seriesId: string): InstrumentId => asInstrumentId(seriesId);

/** §3.17e-i — one region's government bond future for one quarterly delivery week. */
export const bondFutureInstrumentId = (regionId: RegionId, deliveryWeek: number): InstrumentId =>
  asInstrumentId(`${regionId}-BF-${deliveryWeek}`);

/** One region's par interest-rate swap at one of the three quoted tenors. */
export const swapInstrumentId = (regionId: RegionId, tenorKey: string): InstrumentId =>
  asInstrumentId(`${regionId}-IRS-${tenorKey}`);

/** Spot FX for one ordered pair, as `fx-clearing` books it. */
export const fxSpotInstrumentId = (pairKey: string): InstrumentId => asInstrumentId(`FX-${pairKey}`);

/** §3.17b-iv — the cross-currency FUNDING book for one borrower-region/foreign-region pair: the
 *  basis a term loan of the foreign money clears at. A different book from the forward's basis. */
export const xcsFundingInstrumentId = (homeRegion: RegionId, foreignRegion: RegionId): InstrumentId =>
  asInstrumentId(`XCSFUND-${homeRegion}->${foreignRegion}`);

/** §3.17b-iii — one region's index option book, by kind (a put or a call). */
export const indexOptionInstrumentId = (regionId: RegionId, optionType: string): InstrumentId =>
  asInstrumentId(`${regionId}-OPT-${optionType}`);

/** One commodity's futures contract at one delivery tenor, in whole months. */
export const commodityFutureInstrumentId = (commodityId: string, tenorMonths: number): InstrumentId =>
  asInstrumentId(`FUT-${commodityId}-${tenorMonths}M`);

/**
 * A fund's share class: the fund's own entity id, verbatim — the register's key, and since
 * §3.13-BOOK dIII the clearing book's too. Slice (a) found the book clearing the same share under
 * a second key (`ETFSHARE-<fund>`) while every holder's row, the index and the re-mark used this
 * one; that key is gone, and the fund behind a share is a read of the instrument index's issuer
 * (`instrumentIssuerOf`), not a cast of the id.
 */
export const etfShareId = (fundId: string): InstrumentId => asInstrumentId(fundId);

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
export const corporateTrancheId = (ticker: Ticker, rung: number): InstrumentId =>
  asInstrumentId(`${ticker}-T${rung}`);

/**
 * The bridge a company draws to fund the maintenance capex its cash flow could not — a real
 * tranche on a real bank's book, and priced wide because that is what a bridge costs.
 */
export const maintenanceBridgeTrancheId = (ticker: Ticker, week: number): InstrumentId =>
  asInstrumentId(`${ticker}-MAINT-${week}`);

/**
 * §3.16-i — THE REVOLVER: one committed line per borrower and lending bank, drawn and repaid.
 * Every draw — a liquidity shortfall, a maturity the market would not refinance, a paper roll the
 * market refused, an overdraft the close converts — TAPS this line (`tranche-ledger.ts:drawRevolver`);
 * it is opened the first time and reopened when a matured one is gone. The five ids that used
 * to name a fresh facility per draw and per week are gone with the proliferation they named.
 */
export const revolverTrancheId = (companyId: string, bankId: string): InstrumentId =>
  asInstrumentId(`${companyId}-REVOLVER@${bankId}`);

/**
 * The replacement a called tranche becomes. It carries the CALLED tranche's id inside its own, so
 * the holders-of-record replacement (`pendingHolderReplacements`) can be read back to the paper it
 * came from without a second table.
 */
export const calledRefinanceTrancheId = (companyId: string, week: number, calledId: string): InstrumentId =>
  asInstrumentId(`${companyId}-CALL-${week}-${calledId}`);

/** One week's commercial-paper issue by one borrower — short, unsecured, and its own tranche. */
export const commercialPaperTrancheId = (ticker: Ticker, week: number): InstrumentId =>
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
export const acquiredTrancheId = (acquirerTicker: Ticker, week: number, oldId: string): InstrumentId =>
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
  asInstrumentId(peFundEntityId(regionId, fundIndex));

/**
 * The facility draw an overdraft is converted into. `suffix` distinguishes the two sweeps that
 * can strike one in the same week — the corporate sweep and the diversification pass — because
 * two rungs struck on one week under one key would silently be one rung.
 */
/** The facility a company is born owing — the debt half of a sponsor's capital structure. */
export const birthFacilityTrancheId = (companyId: string, week: number): InstrumentId =>
  asInstrumentId(`${companyId}-FACILITY-BIRTH-${week}`);
