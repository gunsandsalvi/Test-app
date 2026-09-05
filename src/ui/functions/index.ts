/** AU — the FUNCTION registry: one entry per module, in the order the strip shows them; the shell reads nothing else. */

import { FunctionModule } from '../fn';
import { ObjectType } from '../types';
import { overview } from './overview';
import { news } from './news';
import { chart } from './chart';
import { statements } from './statements';
import { holders, holdings } from './holders';
import { ladder } from './ladder';
import { curves } from './curves';
import { lines } from './lines';
import { sellers } from './sellers';
import { macro } from './macro';
import { markets, pools, labour, banks, firms, funds } from './lists';
import { links } from './links';
import { contracts } from './contracts';
import { derivatives } from './derivatives';
import { peers } from './peers';
import { all } from './all';

const ORDER: FunctionModule[] = [
  overview, news, macro, chart, statements, ladder, curves, holders, holdings, lines, sellers,
  markets, labour, pools, banks, firms, funds, links, contracts, derivatives, peers, all,
];

/** Keyed by the function's name and SPARSE — a name typed at the command bar may be nobody's. */
export const FUNCTIONS: Partial<Record<string, FunctionModule>> = Object.fromEntries(ORDER.map((f) => [f.name, f]));
export function functionsFor(type: ObjectType): FunctionModule[] {
  return ORDER.filter((f) => f.appliesTo.includes(type));
}

/** The function a word names for this type — exact, or the unique prefix ("stat" → statements). */
export function functionNamed(word: string, type?: ObjectType): FunctionModule | undefined {
  const w = word.toLowerCase();
  const pool = type ? functionsFor(type) : ORDER;
  const exact = pool.find((f) => f.name === w);
  if (exact) return exact;
  if (w.length < 2) return undefined;
  const pre = pool.filter((f) => f.name.startsWith(w));
  return pre.length === 1 ? pre[0] : undefined;
}

export const DEFAULT_FUNCTION = 'overview';
