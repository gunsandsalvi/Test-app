# Project Aurora — Complete UI Rebuild

> Status: **Not started.** Queued after the "1$ is 1$" project, alongside Main Street, Wall
> Street, and Blueprint (see `docs/PROJECT_MAIN_STREET.md`, `docs/PROJECT_WALL_STREET.md`,
> `docs/PROJECT_BLUEPRINT.md`).
> Theme: not an incremental redesign — every current UI element is deleted and rebuilt from
> scratch, aiming for the sleekest, smartest, most interactive interface achievable, drawing
> directly on real-world product design rather than iterating on what exists today.

## The mandate, in the user's own words

> Add another big project on top of the 3: a complete rework from scratch of the UI. By this I
> mean delete every single current element and rebuild it from scratch in the most sleek, smart,
> interactive way you can. You will ask me a long series of questions to nail down how to do it,
> you will prepare mockups and take inspiration from the real world.

This is explicitly NOT a component-by-component refactor or a visual refresh layered on the
existing structure (that smaller-scope work is already tracked separately — see task #33, "Audit
and redesign chart usability across the app," and task #34, "missing numbers/leftover dev
comments" — those stay independent low-level cleanups regardless of Aurora's fate). Aurora starts
from a blank canvas.

## Required process when this project is actually started

The user has specified the process up front, to be followed exactly when Aurora's turn comes —
not decisions to improvise in the moment:

1. **Ask a long series of clarifying questions first.** Before any design or code work begins,
   nail down: overall visual direction/aesthetic references, information architecture (what
   screens/views exist and how they relate), interaction patterns (navigation model, real-time
   update conventions, information density preferences), what real-world products to draw
   inspiration from, platform/responsive scope, and anything else needed to have a concrete brief
   rather than a guess. Use `AskUserQuestion` liberally and iteratively — this is explicitly
   supposed to be a "long series," not one round.
2. **Prepare mockups** before writing production code — static or interactive design mockups the
   user can react to and redirect, so the direction is validated before the full rebuild is
   underway.
3. **Take inspiration from the real world** — real, existing sleek/modern product design (trading
   platforms, dashboards, data-dense consumer apps, etc.), not an abstract or generic redesign.

## Scope note

"Delete every single current element and rebuild it from scratch" is the explicit instruction —
this is a full replacement of the existing UI layer (`src/components/`, `src/App.tsx`, and every
screen under `src/components/screens/`), not a migration that preserves current markup/structure
underneath a new skin. The underlying simulation/domain layer (`src/domain/`, `src/engine/`) is
unaffected — Aurora is a presentation-layer rebuild, not a re-architecture of the simulation
itself.

## Sequencing relative to the other master projects

Queued alongside Main Street, Wall Street, and Blueprint — all four are "after the '1$ is 1$'
project completes," with no fixed order specified among the four yet. Given Aurora is a rebuild
of how every other project's output gets *seen* (households, banking, government, industry
detail all eventually need a UI to surface through), it may make sense to sequence it after at
least some of the other three land, so the rebuilt UI is designed against a more complete picture
of what it needs to display — but this is a suggestion for discussion when the time comes, not a
decision made now.

## Source

New master project requested by the user, 2026-08-26, explicitly pinned for later alongside the
three master projects created earlier the same session.
