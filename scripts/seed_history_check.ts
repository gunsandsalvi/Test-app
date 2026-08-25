import { createInitialGameState } from '../src/engine/simulation';
const state = createInitialGameState();
Object.values(state.commodities as any).forEach((c: any) => console.log(c.id, 'historicalPrices.length:', c.historicalPrices.length));
