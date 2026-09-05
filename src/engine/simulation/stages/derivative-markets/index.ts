/**
 * DRV — THE MARKET DISPATCH TABLE: one market module per derivative class, behind the same
 * registry the contract profiles sit behind (rule 15). The one stage (../derivatives.ts) runs
 * whatever is named here; the table is compile-loud until every class the registry knows has
 * a market. Adding a derivative class = its profile (domain/derivatives/classes/), its registry
 * line, its market module here, and its line in this table.
 */

import { DerivativeClassId } from '../../../../domain/derivatives/contract';
import type { DerivativeMarket } from '../derivatives';
import { IRS_MARKET } from './irs';
import { CDS_MARKET } from './cds';
import { COMMODITY_FUTURE_MARKET } from './commodity-future';
import { FX_FORWARD_MARKET } from './fx-forward';
import { OPTION_MARKET } from './option';
import { XCS_MARKET } from './xcs';

export const DERIVATIVE_MARKETS: Record<DerivativeClassId, DerivativeMarket> = {
  IRS: IRS_MARKET,
  CDS: CDS_MARKET,
  COMMODITY_FUTURE: COMMODITY_FUTURE_MARKET,
  FX_FORWARD: FX_FORWARD_MARKET,
  OPTION: OPTION_MARKET,
  XCS: XCS_MARKET,
};
