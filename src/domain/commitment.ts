/**
 * §3.13-BOOK d4c-vi — A CAPITAL COMMITMENT: a named limited partner's promise of money to a named
 * private fund, drawn by capital calls and returned by distributions. It was a list on the
 * sponsor (`peFund.lpCommitments`); it is a row of the world's contract store now, read through
 * `contract-ledger.ts:lpCommitmentsOf` and moved by `drawCommitment` / `returnCommitment`.
 *
 * A commitment is to the FUND and is payable in the fund's money, so it carries the fund's region
 * and no currency of its own: `obligationCurrencyOf(fund)` is the fact rather than a stand-in for
 * it. The day a cross-border LP exists it needs its own denomination (pe-lifecycle.ts says why).
 */
import type { RegionId } from './geography';
import type { EntityId } from './ids';

export interface LpCommitment {
  /** The private fund the money is promised to. */
  fundId: EntityId;
  /** The limited partner promising it — an institution. */
  lpEntityId: EntityId;
  /** The fund's region, and so the money the commitment is payable in. */
  regionId: RegionId;
  committedLocal: number;
  /** What has been called and not yet returned. */
  drawnLocal: number;
}
