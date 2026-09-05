/**
 * AU — an OBJECT TYPE IS ONE MODULE (rule 15 for the UI). A module says how to find one of its
 * kind, how to name it, what to search it by, how to list its peers, which series it carries,
 * and what its overview looks like. The shell and the functions read this contract and nothing
 * else; adding a kind of thing is one file and one line in `objects/index.ts`.
 */

import { ReactNode } from 'react';
import { NewsItem } from '../../domain/events';
import { ObjectLabel, ObjectRef, ObjectType, Series } from '../types';
import { World } from '../world';
import { Nav } from '../ui';

export interface PeerColumn<T> {
  key: string;
  label: string;
  render: (row: { id: string; obj: T }, world: World, nav: Nav) => ReactNode;
  value: (row: { id: string; obj: T }, world: World) => number | string;
  /** Column weight in fr (the first column is 1.4 by default, the rest 1). */
  width?: number;
}

interface PeerGroup { name: string; ids: string[] }

interface OverviewProps<T> { world: World; ref: ObjectRef; obj: T; nav: Nav }

export interface ObjectModule<T = unknown> {
  type: ObjectType;
  /** The kind in words, singular and plural: ["goods market", "goods markets"]. */
  words: [string, string];
  /** Whether the command bar's free-text search lists this kind (a contract or a tranche is
   *  reached from the object it belongs to — 23k contracts do not belong in a search box). */
  searchable: boolean;
  find(world: World, id: string): T | undefined;
  /** Every live instance, for search and for peers. */
  list(world: World): { id: string; obj: T }[];
  label(world: World, id: string, obj: T): ObjectLabel;
  /** Extra words a search may hit beyond the ticker and the name. */
  keywords?(world: World, id: string, obj: T): string[];
  /** A typed phrase that names one of this kind exactly ("usa apparel", "eur/usd", "oil"). */
  parse?(world: World, phrase: string): string | undefined;
  /** §3.15-i: a CLASS word alone ("bonds", "bills") opens the screener over that peer group —
   *  the word, to the group's name as `peers.groups` spells it. */
  kindWords?: Record<string, string>;
  overview(p: OverviewProps<T>): ReactNode;
  series?(world: World, id: string, obj: T): Series[];
  peers?: {
    groups(world: World, id: string, obj: T): PeerGroup[];
    /** The screener's columns — a list, or a function of the anchor (a bank's peers read a bank's columns). */
    columns: PeerColumn<T>[] | ((world: World, id: string, obj: T) => PeerColumn<T>[]);
    defaultSort: string;
  };
  /** One number for a watch cell or a chip. */
  headline?(world: World, id: string, obj: T): { value: string; sub?: string; neg?: boolean };
  /** Does a story concern this object (beyond the refs it carries)? */
  mentions?(world: World, id: string, obj: T, item: NewsItem): boolean;
}

export function defineObject<T>(m: ObjectModule<T>): ObjectModule<T> { return m; }
