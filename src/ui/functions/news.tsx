/**
 * AU · news — the derived stories that name this object (or, for a region, happen in it),
 * newest first, ranked within a week by what they are worth. Every identifier in a story is a
 * link; a story's WHY (the ledger trace) sits under it. The feed is the engine's `newsFeed`.
 */

import { ReactNode } from 'react';
import { FunctionModule } from '../fn';
import { Card, Empty, Hint, Link, Muted, T, mono } from '../ui';
import { formatDate } from '../calendar';
import { World } from '../world';
import { ObjectRef } from '../types';
import { refOfIdentifier, labelOf, storyMentions, OBJECT_TYPES } from '../objects';
import { NewsItem } from '../../domain/events';
import { Nav } from '../ui';

const IDENT = /\b([A-Z][A-Z0-9]{1,5})\b/g;

/** Plain text with every token that resolves to an object turned into a link. */
function Linked({ text, world, nav }: { text: string; world: World; nav: Nav }) {
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  IDENT.lastIndex = 0;
  while ((m = IDENT.exec(text)) !== null) {
    const ref = refOfIdentifier(world, m[1]);
    if (!ref) continue;
    parts.push(text.slice(last, m.index));
    parts.push(<Link key={`${m.index}`} to={ref} nav={nav} style={mono}>{m[1]}</Link>);
    last = m.index + m[1].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

/** The stories for an object (undefined = the whole world), newest week first, material first within a week. */
export function storiesFor(world: World, ref?: ObjectRef, limit = 60): NewsItem[] {
  const feed = world.state.newsFeed;
  const mine = ref ? feed.filter((n) => storyMentions(world, ref, n)) : feed;
  return [...mine].sort((a, b) => b.week - a.week || (b.materialityLocal ?? 0) - (a.materialityLocal ?? 0) || Number(b.urgent) - Number(a.urgent)).slice(0, limit);
}

export function Story({ item, world, nav, compact }: { item: NewsItem; world: World; nav: Nav; compact?: boolean }) {
  return (
    <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.rule}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
        <span style={{ fontWeight: 700, color: item.urgent ? T.text : '#d7dce4' }}><Linked text={item.title.replace(/^\[[A-Z ]+\]\s*/, '')} world={world} nav={nav} /></span>
        <Hint style={{ whiteSpace: 'nowrap', ...mono }}>{formatDate(item.week - (world.state.burnInWeeks ?? 0))}</Hint>
      </div>
      {!compact ? <Muted style={{ fontSize: 13, lineHeight: 1.45 }}><Linked text={item.description} world={world} nav={nav} /></Muted> : null}
      {!compact && item.cause ? <Hint style={{ lineHeight: 1.4 }}>why · <Linked text={item.cause} world={world} nav={nav} /></Hint> : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {item.kind ? <Hint style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.kind}</Hint> : <Hint style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.category.toLowerCase().replace(/_/g, ' ')}</Hint>}
        {(item.refs ?? []).slice(0, 6).map((r) => {
          const l = labelOf(world, r);
          return <Link key={`${r.type}:${r.id}`} to={r} nav={nav} style={{ fontSize: 11, ...mono }}>{l.ticker}</Link>;
        })}
      </div>
    </div>
  );
}

export const news: FunctionModule = {
  name: 'news',
  appliesTo: OBJECT_TYPES,
  blurb: 'what happened, and why',
  render({ world, ref, nav }) {
    const items = storiesFor(world, ref);
    if (items.length === 0) return <Empty>nothing has been written about {labelOf(world, ref).ticker} yet — stories appear as the world records defaults, ratings, entries, mergers, plant changes, bank funding and a region's labour and prices.</Empty>;
    let lastWeek = -1;
    return (
      <Card style={{ overflow: 'hidden' }}>
        {items.map((it) => {
          const head = it.week !== lastWeek ? <div key={`h${it.week}`} style={{ padding: '8px 14px 2px', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.muted, background: '#161c25' }}>{formatDate(it.week - (world.state.burnInWeeks ?? 0))}</div> : null;
          lastWeek = it.week;
          return <div key={it.id}>{head}<Story item={it} world={world} nav={nav} /></div>;
        })}
      </Card>
    );
  },
};
