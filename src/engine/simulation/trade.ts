import { GameState, Position } from '../../types';
import { random } from '../rng';
import { DESK_BOOK_BY_ASSET_TYPE } from '../dealers';
import { regionalDeskView } from '../../domain/dealer-desk';
import { bookPnL } from '../ledger/bank-book';
import { adjustBankReserves } from '../ledger/accounts';
import { ensureV2 } from '../../engine2/world';
import { DERIVATIVE_CLASSES } from '../../domain/derivatives/registry';
import { DerivativeClassId } from '../../domain/derivatives/contract';

/** The player's legacy position types onto the registry's classes; anything the registry does
 *  not know is charged at the FX forward's add-on, which is what every derivative paid before. */
const PLAYER_ASSET_TYPE_CLASS: Record<string, DerivativeClassId> = { IRS: 'IRS', CDS: 'CDS', COMMODITY: 'COMMODITY_FUTURE', FX: 'FX_FORWARD' };
const playerPfeAddOnRate = (assetType: string): number =>
  DERIVATIVE_CLASSES[PLAYER_ASSET_TYPE_CLASS[assetType] ?? 'FX_FORWARD'].pfeAddOnRate;

export function executeTrade(
  state: GameState,
  posData: Omit<Position, 'id' | 'openedWeek' | 'unrealizedPnL' | 'realizedPnL' | 'maintenanceMargin' | 'weeklyFinancingCost'>,
  executionDetails?: { fillPrice: number; counterpartyFeeUSD: number; sourcedFrom: string; spreadCostUSD: number }
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

  const updatedCash = state.portfolio.cashUSD - (executionDetails?.spreadCostUSD ?? 0);

  const updatedPositions = [newPos, ...state.portfolio.positions];
  const totalMarginReq = updatedPositions.reduce((s, p) => s + p.marginRequirement, 0);
  const totalMaintMargin = updatedPositions.reduce((s, p) => s + p.maintenanceMargin, 0);

  const navUSD = updatedCash + updatedPositions.reduce((s, p) => s + p.unrealizedPnL, 0);
  const marginUtilizationPct = navUSD > 0 ? Math.round((totalMarginReq / navUSD) * 100) : 100;

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
      const book = DESK_BOOK_BY_ASSET_TYPE[posData.assetType] ?? 'derivatives';
      const instrumentId = posData.trancheId || posData.symbol;
      const balanceSheetUseUSD = book === 'derivatives'
        ? posData.notional * playerPfeAddOnRate(posData.assetType)
        : posData.notional;
      // Buying takes paper OFF the desk; selling puts it on. A short sale is the desk taking the
      // other side, which leaves it long, exactly as a real client short does. A derivative
      // consumes the desk either way — the add-on is charged on gross notional, not net.
      const inventoryDeltaUSD = book === 'derivatives'
        ? balanceSheetUseUSD
        : (posData.direction === 'LONG' ? -balanceSheetUseUSD : balanceSheetUseUSD);
      const incomeUSD = executionDetails.counterpartyFeeUSD + executionDetails.spreadCostUSD;

      const inventory = { ...(sheet.dealerDeskInventory ?? {}) };
      const rows = [...(inventory[book] ?? [])];
      const at = rows.findIndex((r) => r.instrumentId === instrumentId);
      if (at >= 0) rows[at] = { instrumentId, inventoryUSD: rows[at].inventoryUSD + inventoryDeltaUSD };
      else rows.push({ instrumentId, inventoryUSD: inventoryDeltaUSD });
      inventory[book] = rows.filter((r) => Math.abs(r.inventoryUSD) > 1);

      updatedCompanies = [...state.companies];
      updatedCompanies[bankIndex] = {
        ...bank,
        bankBalanceSheet: {
          ...bookPnL(sheet, incomeUSD, 'player trade fee/spread', bank.ticker),
          dealerDeskInventory: inventory,
          cashReservesUSD: sheet.cashReservesUSD - inventoryDeltaUSD + incomeUSD,
        },
      };
      adjustBankReserves(ensureV2(state), bank.ticker, -inventoryDeltaUSD + incomeUSD); // A3.6a

      // The region's view of that book, kept in step for the readers that want one aggregate.
      const region = updatedRegions[posData.region];
      if (region) {
        const view = (b: string) => Array.from(regionalDeskView(
          updatedCompanies
            .filter((c) => c.region === posData.region && c.isBankEntity)
            .map((c) => c.bankBalanceSheet?.dealerDeskInventory),
          b
        ).entries())
          .filter(([, usd]) => Math.abs(usd) > 1)
          .map(([companyId, inventoryUSD]) => ({ companyId, inventoryUSD }));
        updatedRegions[posData.region] = {
          ...region,
          bankingSector: {
            ...region.bankingSector,
            corpBondDealerInventory: view('corporate bond'),
            loanDealerInventory: view('leveraged loan'),
          },
        };
      }
    }
  }

  return {
    ...state,
    companies: updatedCompanies,
    regions: updatedRegions,
    portfolio: {
      ...state.portfolio,
      cashUSD: updatedCash,
      navUSD,
      positions: updatedPositions,
      totalRequiredMarginUSD: totalMarginReq,
      maintenanceMarginUSD: totalMaintMargin,
      marginUtilizationPct,
      isMarginCall: navUSD < totalMaintMargin,
    }
  };
}
