/** AU — the FUNCTION registry: one entry per module; the shell reads nothing else. */

import { FunctionModule } from '../fn';
import { ObjectType } from '../world';
import { overview } from './overview';
import { all } from './all';
import { chart } from './chart';
import { statements } from './statements';
import { holders, holdings } from './holders';
import { peers } from './peers';

export const FUNCTIONS: Record<string, FunctionModule> = Object.fromEntries(
  [overview, all, chart, statements, holders, holdings, peers].map((f) => [f.name, f])
);

export const FUNCTION_NAMES = Object.keys(FUNCTIONS);

export function functionsFor(type: ObjectType): FunctionModule[] {
  return Object.values(FUNCTIONS).filter((f) => f.appliesTo.includes(type) && f.name !== 'holdings');
}

export const DEFAULT_FUNCTION = 'overview';
