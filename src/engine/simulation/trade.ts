import { GameState, Position } from '../../types';
import { random } from '../rng';

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

  const updatedRegions = { ...state.regions };
  if (executionDetails) {
    const region = updatedRegions[posData.region];
    if (region) {
      // S9: a player order is client flow to a real dealer desk, and the desk's INVENTORY is
      // where it lands. The previous version sourced the position by walking down the sector
      // itemizedHoldings — which S7 turned into a derived view, rebuilt from the real books every
      // week, so those writes were silently discarded and the trade touched nothing at all.
      //
      // Inventory is the right home for a second reason: the clearing engines already read prior
      // dealer inventory and lean on it, so a player buy leaves the desk short and next week's
      // auction prices that shortfall. The player's market impact arrives through the mechanism
      // that already exists, not through a bespoke impact formula.
      const instrumentId = posData.trancheId || posData.symbol;
      // Buying takes paper OFF the desk; selling puts it on. A short sale is the desk taking the
      // other side, which leaves it long, exactly as a real client short does.
      const inventoryDeltaUSD = posData.direction === 'LONG' ? -posData.notional : posData.notional;

      const applyToInventory = (book: { companyId: string; inventoryUSD: number }[] | undefined) => {
        const next = [...(book ?? [])];
        const idx = next.findIndex(p => p.companyId === instrumentId);
        if (idx >= 0) next[idx] = { ...next[idx], inventoryUSD: next[idx].inventoryUSD + inventoryDeltaUSD };
        else next.push({ companyId: instrumentId, inventoryUSD: inventoryDeltaUSD });
        return next;
      };

      // §6: 'LEV_LOAN' never existed in the AssetType union — the one producer (CompanyDeepDive)
      // now emits 'LEVERAGED_LOAN' like everything else, so the string-match tolerance is gone.
      const isLoan = posData.assetType === 'LEVERAGED_LOAN';
      const isCorpBond = posData.assetType === 'CORP_BOND';

      updatedRegions[posData.region] = {
        ...region,
        bankingSector: {
          ...region.bankingSector,
          // The desk's real earnings on the flow it facilitated.
          // RULE 14, OPEN: equity is credited with NO CASH LEG, and to the REGIONAL aggregate
          // rather than a named bank. 07b does the same thing correctly and says why — "an
          // equity write with no cash leg breaks the balance-sheet identity the invariants
          // harness now asserts per bank per week". Owner: G3 (8).
          bankEquityUSD: region.bankingSector.bankEquityUSD + executionDetails.counterpartyFeeUSD + executionDetails.spreadCostUSD,
          ...(isCorpBond ? { corpBondDealerInventory: applyToInventory(region.bankingSector.corpBondDealerInventory) } : {}),
          ...(isLoan ? { loanDealerInventory: applyToInventory(region.bankingSector.loanDealerInventory) } : {}),
        },
      };
    }
  }

  return {
    ...state,
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
