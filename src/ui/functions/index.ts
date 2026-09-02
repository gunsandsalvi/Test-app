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
import { markets, pools, labour, banks, firms, funds, books } from './lists';
import { links } from './links';
import { contracts } from './contracts';
import { diag } from './diag';
import { peers } from './peers';
import { all } from './all';

const ORDER: FunctionModule[] = [
  overview, news, macro, chart, statements, ladder, curves, holders, holdings, lines, sellers,
  markets, labour, pools, banks, firms, funds, books, links, contracts, diag, peers, all,
];

export const FUNCTIONS: Record<string, FunctionModule> = Object.fromEntries(ORDER.map((f) => [f.name, f]));
export const FUNCTION_NAMES = ORDER.map((f) => f.name);

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
