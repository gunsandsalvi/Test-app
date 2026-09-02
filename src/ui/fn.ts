/**
 * AU — a FUNCTION is one module: a word, the object types it applies to, and a render. The
 * shell never switches on a type outside the registries (rule 17 for the UI).
 */

import { ReactNode } from 'react';
import { ObjectRef, ObjectType } from './types';
import { World } from './world';
import { Nav } from './ui';

export interface FnProps {
  world: World;
  ref: ObjectRef;
  args: Record<string, string>;
  nav: Nav;
}

export interface FunctionModule {
  name: string;
  appliesTo: ObjectType[];
  /** One line for the command bar's function chips. */
  blurb: string;
  /** What a trailing word means to this function ("series", "tab", "path"); the shell passes the
   *  rest of the command under this key. */
  argKey?: string;
  render(props: FnProps): ReactNode;
}
