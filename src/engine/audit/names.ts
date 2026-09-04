/** N — NAMES AND IDENTITIES. A thing has one id in one shape, and its parts carry its name. */

import { GameState } from '../../types';
import { AuditFinding } from './types';
import { ensureV2 } from '../../engine2/world';
import { ladderRowsOf, trancheIdOf } from '../../engine2/tranches';

export function auditNames(state: GameState, week: number): AuditFinding[] {
  const out: AuditFinding[] = [];
  const tickers = new Map<string, number>(); const names = new Map<string, number>();
  let badTicker = 0, badId = 0, badName = 0, badTranche = 0; const ex: string[] = [];
  const v2 = ensureV2(state);
  state.companies.forEach((c) => {
    tickers.set(c.ticker, (tickers.get(c.ticker) ?? 0) + 1);
    names.set(c.name, (names.get(c.name) ?? 0) + 1);
    if (!/^[A-Z]{3,5}$/.test(c.ticker) || c.ticker === 'XXXX') badTicker++;
    if (/ \d+ Corp$/.test(c.name)) badName++;
    if (!new RegExp(`^${c.region}_(PRV_|CAR_)?${c.ticker}$`).test(c.id)) { badId++; if (ex.length < 3) ex.push(`${c.ticker} id ${c.id}`); }
    for (const r of ladderRowsOf(v2, c.id)) { const id = trancheIdOf(v2, r); if (!id.startsWith(c.ticker + '-') && !id.startsWith(c.id + '-') && !id.startsWith(c.id + '_')) { badTranche++; if (ex.length < 6) ex.push(`${c.ticker} tranche ${id}`); } }
  });
  const dupT = [...tickers.entries()].filter(([, n]) => n > 1).length;
  const dupN = [...names.entries()].filter(([, n]) => n > 1).length;
  if (dupT) out.push({ family: 'N', check: 'N1 tickers unique', week, usd: dupT, message: `${dupT} tickers are shared by more than one firm` });
  if (dupN) out.push({ family: 'N', check: 'N1 names unique', week, usd: dupN, message: `${dupN} names are shared` });
  if (badTicker) out.push({ family: 'N', check: 'N1 tickers well formed', week, usd: badTicker, message: `${badTicker} tickers are not 3–5 capitals or are the XXXX fallback` });
  if (badName) out.push({ family: 'N', check: 'N1 no fallback names', week, usd: badName, message: `${badName} names are the "… 1234 Corp" fallback` });
  if (badId) out.push({ family: 'N', check: 'N2 ids are REGION_TICKER', week, usd: badId, message: `${badId} firms carry an id that is not region_ticker (${ex.filter((e) => e.includes(' id ')).join(', ')})` });
  if (badTranche) out.push({ family: 'N', check: 'N2 tranche ids carry the owner\'s ticker', week, usd: badTranche, message: `${badTranche} tranches are named for another firm (${ex.filter((e) => e.includes('tranche')).join(', ')})` });
  return out;
}
