import { GameState, Position } from '../../types';
import { random } from '../rng';
import { DESK_BOOK_BY_ASSET_TYPE } from '../dealers';
import { DESK_BOOK_KIND } from '../../domain/dealer-desk';
import { transferHolding } from '../ledger/holdings-ledger';
import { newWireJournal, setActiveWireJournal, setActiveWireWorld } from '../ledger/wire';
import { wireWorldOf } from '../ledger/wire-world';
import { bankSecuritiesPartyOf } from '../../domain/party';
import { clearedPriceOf } from '../../engine2/prices';
import { bookPnL } from '../ledger/bank-book';
import { adjustBankReserves } from '../ledger/accounts';
import { ensureV2 } from '../../engine2/world';
import { DERIVATIVE_CLASSES } from '../../domain/derivatives/registry';
import { equityInstrumentId } from '../../domain/instrument-keys';
import { asInstrumentId, type InstrumentId } from '../../domain/ids';

/** §3.17b-ii: the one position kind that consumes a desk through an add-on is FX spot, at the FX
 *  forward's — the derivative kinds the legacy layer carried are contracts on the one book now. */
const FX_SPOT_PFE_ADD_ON_RATE = DERIVATIVE_CLASSES.FX_FORWARD.pfeAddOnRate;

export function executeTrade(
  state: GameState,
  posData: Omit<Position, 'id' | 'openedWeek' | 'unrealizedPnL' | 'realizedPnL' | 'maintenanceMargin' | 'weeklyFinancingCost'>,
  executionDetails?: { fillPrice: number; counterpartyFeeLocal: number; sourcedFrom: string; spreadCostLocal: number }
): GameState {
  const newPos: Position = {
    ...posData,
    id: `pos_${Date.now()}_${Math.floor(random() * 1000)}`,
    openedWeek: state.currentWeek,
    unrealizedPnL: 0,
    realizedPnL: 0,
    maintenanceMargin: posData.marginRequirement * 0.7,
    weeklyFinancingCost: 0,
  };

  const updatedCash = state.portfolio.cashLocal - (executionDetails?.spreadCostLocal ?? 0);

  const updatedPositions = [newPos, ...state.portfolio.positions];
  const totalMarginReq = updatedPositions.reduce((s, p) => s + p.marginRequirement, 0);
  const totalMaintMargin = updatedPositions.reduce((s, p) => s + p.maintenanceMargin, 0);

  const navLocal = updatedCash + updatedPositions.reduce((s, p) => s + p.unrealizedPnL, 0);
  const marginUtilizationPct = navLocal > 0 ? Math.round((totalMarginReq / navLocal) * 100) : 100;

  // G3b: a player order is an order to a NAMED bank's desk — the same desk that makes markets
  // in this book for every other participant. `dealerId` is that bank's ticker.
  //
  // What this replaces: the desk's earnings were credited to the REGIONAL aggregate with no cash
  // leg (07b states the rule this breaks — "an equity write with no cash leg breaks the per-bank
  // identity"), and only two of the eight asset classes moved any inventory at all, because the
  // regional arrays only existed for corporate bonds and loans.
  //
  // Both legs, same pass. The desk's inventory moves by the notional and its reserves move the
  // other way — it paid for the paper, or was paid for it — so total assets are unchanged and
  // the per-bank identity holds; a derivative consumes the desk through the same PFE add-on the
  // FX forward book uses rather than at notional. The spread and any fee are income: cash and
  // equity together.
  let updatedCompanies = state.companies;
  const updatedRegions = { ...state.regions };
  if (executionDetails) {
    const bankIndex = state.companies.findIndex((c) => c.ticker === posData.dealerId && c.bankBalanceSheet);
    if (bankIndex >= 0) {
      const bank = state.companies[bankIndex];
      const sheet = bank.bankBalanceSheet!;
      const book = DESK_BOOK_BY_ASSET_TYPE[posData.assetType];
      // §3.13-BOOK slice (a): a ticket names a TRANCHE where it has one and the equity of its
      // symbol's issuer where it does not — the same crossing `instrument-keys.ts` records.
      const instrumentId: InstrumentId = posData.trancheId
        ? asInstrumentId(posData.trancheId)
        : equityInstrumentId(posData.symbol);
      const balanceSheetUseLocal = book === 'derivatives'
        ? posData.notional * FX_SPOT_PFE_ADD_ON_RATE
        : posData.notional;
      // Buying takes paper OFF the desk; selling puts it on. A short sale is the desk taking the
      // other side, which leaves it long, exactly as a real client short does. A derivative
      // consumes the desk either way — the add-on is charged on gross notional, not net.
      const inventoryDeltaLocal = book === 'derivatives'
        ? balanceSheetUseLocal
        : (posData.direction === 'LONG' ? -balanceSheetUseLocal : balanceSheetUseLocal);
      const incomeLocal = executionDetails.counterpartyFeeLocal + executionDetails.spreadCostLocal;

      // §3.13-BOOK d3d: the desk's paper is REGISTER ROWS, so the player's fill is a transfer
      // between the desk and the clearing house — the player's own portfolio lives outside the
      // register (`state.portfolio`), so the house is the far side of the wire. A derivative or a
      // commodity exposure consumes the desk through a PFE add-on and holds no paper: that stays a
      // scalar on the sheet. The trade runs between weeks, so it opens a journal of its own.
      const v2 = ensureV2(state);
      const kind = book === 'derivatives' || book === 'commodity' ? undefined : DESK_BOOK_KIND[book];
      const sheetAfter = bookPnL(sheet, incomeLocal, 'player trade fee/spread', bank.ticker);
      if (kind === undefined) {
        updatedCompanies = [...state.companies];
        updatedCompanies[bankIndex] = { ...bank, bankBalanceSheet: { ...sheetAfter, deskDerivativesUseLocal: (sheetAfter.deskDerivativesUseLocal ?? 0) + inventoryDeltaLocal } };
      } else {
        const px = kind === 'EQUITY'
          ? Math.max(1e-9, state.companies.find((c) => c.id === posData.symbol)?.stockPrice ?? 1)
          : Math.max(1e-9, clearedPriceOf(v2, instrumentId) ?? 1);
        const units = Math.abs(inventoryDeltaLocal) / px;
        const j = newWireJournal((state as { nextWireId?: number }).nextWireId ?? 1, state.currentWeek);
        setActiveWireJournal(j);
        setActiveWireWorld(wireWorldOf(v2, state.companies, state.institutionalEntities));
        try {
          const desk = bankSecuritiesPartyOf(bank.id);
          const house = { kind: 'CLEARING_HOUSE' as const, region: posData.region };
          const spec = { instrumentType: kind, instrumentId, issuerRegion: posData.region, valueLocal: Math.abs(inventoryDeltaLocal), ...(kind === 'EQUITY' ? { shares: units } : { units }) };
          if (inventoryDeltaLocal > 0) transferHolding(v2, house, desk, spec, 'player trade: desk fill');
          else if (inventoryDeltaLocal < 0) transferHolding(v2, desk, house, spec, 'player trade: desk fill');
        } finally {
          setActiveWireJournal(undefined);
          setActiveWireWorld(undefined);
        }
        (state as { nextWireId?: number }).nextWireId = j.base + j.n;
        updatedCompanies = [...state.companies];
        updatedCompanies[bankIndex] = { ...bank, bankBalanceSheet: sheetAfter };
      }
      // A3.6: the desk pays for inventory from the bank's account and the fee lands on it.
      adjustBankReserves(v2, bank.id, -inventoryDeltaLocal + incomeLocal);

    }
  }

  return {
    ...state,
    companies: updatedCompanies,
    regions: updatedRegions,
    portfolio: {
      ...state.portfolio,
      cashLocal: updatedCash,
      navLocal,
      positions: updatedPositions,
      totalRequiredMarginLocal: totalMarginReq,
      maintenanceMarginLocal: totalMaintMargin,
      marginUtilizationPct,
      isMarginCall: navLocal < totalMaintMargin,
    }
  };
}
