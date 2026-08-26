import { GameState, Position } from '../../types';

export function executeTrade(
  state: GameState,
  posData: Omit<Position, 'id' | 'openedWeek' | 'unrealizedPnL' | 'realizedPnL' | 'maintenanceMargin' | 'weeklyFinancingCost'>,
  executionDetails?: { fillPrice: number; counterpartyFeeUSD: number; sourcedFrom: string; spreadCostUSD: number }
): GameState {
  const newPos: Position = {
    ...posData,
    id: `pos_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
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
      const instrumentId = posData.trancheId || posData.symbol;
      let remainingToSource = posData.notional;
      let newBankHoldings = [...region.bankingSector.itemizedHoldings];
      let newInstHoldings = [...region.institutionalSector.itemizedHoldings];

      newBankHoldings = newBankHoldings.map(h => {
        if (h.instrumentId === instrumentId && remainingToSource > 0) {
          const deduction = Math.min(h.quantityOrNotionalUSD, remainingToSource);
          remainingToSource -= deduction;
          return { ...h, quantityOrNotionalUSD: h.quantityOrNotionalUSD - deduction };
        }
        return h;
      }).filter(h => h.quantityOrNotionalUSD > 0.01);

      if (remainingToSource > 0) {
        newInstHoldings = newInstHoldings.map(h => {
          if (h.instrumentId === instrumentId && remainingToSource > 0) {
            const deduction = Math.min(h.quantityOrNotionalUSD, remainingToSource);
            remainingToSource -= deduction;
            return { ...h, quantityOrNotionalUSD: h.quantityOrNotionalUSD - deduction };
          }
          return h;
        }).filter(h => h.quantityOrNotionalUSD > 0.01);
      }

      updatedRegions[posData.region] = {
        ...region,
        bankingSector: {
          ...region.bankingSector,
          bankEquityUSD: region.bankingSector.bankEquityUSD + executionDetails.counterpartyFeeUSD + executionDetails.spreadCostUSD,
          itemizedHoldings: newBankHoldings
        },
        institutionalSector: {
          ...region.institutionalSector,
          itemizedHoldings: newInstHoldings
        }
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
