/**
 * DRV — THE ONE DERIVATIVE STAGE (FINALIZATION step 0, §7.382). §7.337 unified the CONTRACT —
 * one type, one book, one lifecycle, one hedging arithmetic, four profiles behind a registry —
 * and left four market STAGES standing, each walking the whole book per participant with its
 * own desk arithmetic; two of them were 44% of the week (§7.380). This stage runs every class
 * the registry names, in the registry's order, at the phase of the week its market opens in:
 *
 *   CLEARING         — with the clearing books: swaps after 07c (the cleared curve every
 *                      schedule reads), protection after 07b (the cleared OAS), futures after
 *                      07-commodities (spot).
 *   POST_SETTLEMENT  — after the holdings write-back and settlement have left the cross-border
 *                      book behind: forwards hedge what a holder ACTUALLY ended up holding.
 *
 * For each class: the standing book settles through the one lifecycle (before the market for
 * a rate leg, which pays what printed; after it for a mark leg, which needs the print the
 * market is about to make), the market reads the STANDING INDEX — one walk of the book per
 * settle, a lookup per question (domain/derivatives/standing-book.ts) — and strikes into the
 * one book. Nothing here switches on the class (rule 17): the market modules under
 * `derivative-markets/` carry everything that is a class's own, behind their dispatch table.
 */

import { GameState } from '../../../types';
import { DerivativeClassId } from '../../../domain/derivatives/contract';
import { DERIVATIVE_CLASS_IDS } from '../../../domain/derivatives/registry';
import { StandingBook } from '../../../domain/derivatives/standing-book';
import { WeeklyStepContext } from './context';
import {
  DerivativeLifecycleView, buildDerivativeMarketView, settleDerivativeClass, standingBookOf,
} from './derivative-lifecycle';
import { DERIVATIVE_MARKETS } from './derivative-markets';

/** Where in the week a class's market opens. */
export type DerivativePhase = 'CLEARING' | 'POST_SETTLEMENT';

/** What the stage hands a market for its turn. */
export interface DerivativeMarketRun {
  state: GameState;
  ctx: WeeklyStepContext;
  week: number;
  /** The flat market view of this phase — the same one the lifecycle settles the class on. */
  view: DerivativeLifecycleView;
  /** The standing book after this class's settle, kept current by every strike. */
  standing: StandingBook;
  /** Each party's net cash settled in this class's settle (positive = received), for a market
   *  whose budget test reads it before striking; empty when the class settles after the market. */
  settledNetByParty: Map<string, number>;
}

/** A class's MARKET: who needs the hedge, who supplies it, the print, the strike. */
export interface DerivativeMarket {
  classId: DerivativeClassId;
  phase: DerivativePhase;
  /** A rate leg settles before the market (it pays what the week printed); a mark leg settles
   *  after it (the mark needs the print this market makes). */
  settles: 'BEFORE_MARKET' | 'AFTER_MARKET';
  run(r: DerivativeMarketRun): void;
}

export function runDerivativesStage(state: GameState, ctx: WeeklyStepContext, phase: DerivativePhase): void {
  const view = buildDerivativeMarketView(ctx);
  for (const classId of DERIVATIVE_CLASS_IDS) {
    const market = DERIVATIVE_MARKETS[classId];
    if (market.phase !== phase) continue;
    const settledNetByParty = market.settles === 'BEFORE_MARKET'
      ? settleDerivativeClass(ctx, state, classId, view)
      : new Map<string, number>();
    market.run({ state, ctx, week: ctx.nextWeek, view, standing: standingBookOf(ctx, state), settledNetByParty });
    if (market.settles === 'AFTER_MARKET') settleDerivativeClass(ctx, state, classId, view);
  }
}
