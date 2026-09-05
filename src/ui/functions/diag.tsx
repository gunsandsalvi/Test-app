/**
 * AU · diag — the instruments: which names the damper bound this week and for how long, the
 * dead ceilings, the bench's step time. For a region, its books; for a book, its names.
 */

import { FunctionModule } from '../fn';
import { Card, Hint, KV, Link, Table, T } from '../ui';
import { count } from '../format';
import { REGION_IDS } from '../../domain/geography';
import { instrumentRef, instrumentName, bookId } from '../objects/book';
import { SectionLabel } from '../objects/common';

export const diag: FunctionModule = {
  name: 'diag',
  appliesTo: ['region', 'book'],
  blurb: 'the instruments',
  render({ world, ref, nav }) {
    const streaks = world.state.damperBindStreakById ?? {};
    const bound = world.state.lastWeekDamperBoundIds ?? [];
    const dead = world.state.lastWeekDeadCeilingBooks ?? [];
    const region = ref.type === 'region' ? ref.id : ref.id.split(':')[1];
    const bookName = ref.type === 'book' ? ref.id.split(':')[0] : undefined;
    const parse = (key: string) => { const i = key.indexOf(':'); const rest = key.slice(i + 1); const dir = rest.endsWith('+') ? 'up' : rest.endsWith('-') ? 'down' : ''; return { book: key.slice(0, i), id: dir ? rest.slice(0, -1) : rest, dir }; };
    const regionOfId = (id: string) => { const m = id.match(/^([A-Z]+)[_:-]/); return m ? m[1] : REGION_IDS.find((r) => id.startsWith(r)) ?? 'ALL'; };
    const rows = bound.map(parse).filter((x) => (regionOfId(x.id) === region || region === 'ALL') && (!bookName || x.book === bookName)).map((x) => ({ ...x, streak: streaks[`${x.book}:${x.id}`] ?? 1 })).sort((a, b) => b.streak - a.streak);
    const byBook = new Map<string, number>();
    rows.forEach((x) => byBook.set(x.book, (byBook.get(x.book) ?? 0) + 1));
    return (<>
      <Card style={{ padding: '2px 0' }}>
        <KV k="names bound this week" hint={region} v={count(rows.length)} />
        <KV k="bound 3+ weeks" v={count(rows.filter((x) => x.streak >= 3).length)} />
        <KV k="dead ceilings" hint="books whose cap no bid reached" v={dead.length ? dead.join(' · ') : 'none'} />
        <KV k="all regions" hint="bound this week" v={count(bound.length)} />
      </Card>
      {byBook.size > 0 ? (<>
        <SectionLabel>by book</SectionLabel>
        <Card style={{ padding: '2px 0' }}>
          {[...byBook.entries()].sort((a, b) => b[1] - a[1]).map(([b, n]) => <KV key={b} k={<Link to={{ type: 'book', id: bookId(b, region) }} nav={nav}>{b}</Link>} v={count(n)} />)}
        </Card>
      </>) : null}
      <SectionLabel>the names</SectionLabel>
      {rows.length === 0 ? <Card style={{ padding: 14, color: T.muted }}>nothing bound — every print cleared inside its cap.</Card> : (
        <Table rows={rows} keyOf={(x) => `${x.book}:${x.id}`} columns={[
          { key: 'name', label: 'name', render: (x) => { const r = instrumentRef(world, x.id); return r ? <Link to={r} nav={nav}>{instrumentName(world, x.id)}</Link> : x.id; } },
          { key: 'book', label: 'book', render: (x) => x.book },
          { key: 'dir', label: 'wanted', render: (x) => x.dir || '—' },
          { key: 'streak', label: 'weeks', render: (x) => count(x.streak) },
        ]} />
      )}
      {rows.length > 80 ? <Hint style={{ padding: '0 4px' }}>{rows.length - 80} more.</Hint> : null}
      <Hint style={{ padding: '0 4px' }}>the damper bounds a print's weekly move; a name bound k weeks running gets a cap (1+k)× wider, up to 4×. The bench is at <a href="#bench" style={{ color: T.accent }}>#bench</a>.</Hint>
    </>);
  },
};
