/**
 * §3.17b-i — THE OPTION MARKET'S SLOT. The class exists on the one book; nobody strikes into it
 * yet. The dispatch table is compile-loud until every class has a market, and this is the
 * option's until 17b-iii builds one — index puts for the equity holders, written by the desks
 * and the volatility sellers at a cleared implied volatility. The phase and the settle order
 * are the real ones already: an option is struck after the week's prints and settled after it
 * strikes, so the premium leg fires in the strike week.
 */

import type { DerivativeMarket } from '../derivatives';

export const OPTION_MARKET: DerivativeMarket = {
  classId: 'OPTION',
  phase: 'POST_SETTLEMENT',
  settles: 'AFTER_MARKET',
  run: () => { /* 17b-iii */ },
};
