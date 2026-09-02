/** AU · overview — the object at a glance: the module's own page, with a tile for every function that applies. */

import { FunctionModule } from '../fn';
import { Card, T } from '../ui';
import { moduleOf, OBJECT_TYPES } from '../objects';

export const overview: FunctionModule = {
  name: 'overview',
  appliesTo: OBJECT_TYPES,
  blurb: 'at a glance',
  render({ world, ref, nav }) {
    const m = moduleOf(ref.type);
    const obj = m.find(world, ref.id);
    if (obj === undefined) return <Card style={{ padding: 14, color: T.muted }}>not in the world this week.</Card>;
    return <>{m.overview({ world, ref, obj, nav })}</>;
  },
};
