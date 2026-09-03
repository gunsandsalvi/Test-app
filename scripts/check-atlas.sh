#!/usr/bin/env bash
# THE SYSTEM ATLAS GATE (docs/systems/README.md).
#
# The atlas is only worth having if it cannot silently stop describing the code. This repo has
# three dead documents proving how that ends: a CLAUDE.md that described sections which no longer
# existed, an ARCHITECTURE.md referenced from code and never written, and 699 comments pointing at
# a deleted section. So the code side of every tree is machine-checked here, and check-hygiene.sh
# calls this on every commit.
#
# Two checks, both about DRIFT and neither about content:
#   RESOLUTION — every `path/file.ts:symbol` citation names a file that exists and a symbol that
#     appears in it, so a rename that leaves the atlas behind fails the build. (It caught seven
#     wrong citations on its first run, which is the argument for it.)
#   COVERAGE — every stage core.ts runs, and EVERY SOURCE FILE UNDER src, is in a tree or admitted
#     in docs/systems/UNMAPPED. A new system cannot ship undescribed and a new FILE cannot ship
#     unclassified. UNMAPPED's length is exactly how far along the atlas is, and it only shrinks.
#
# Coverage went stage-only → +src/domain → EVERYTHING (user, 2026-09-03: "can you just extend the
# gate to everything?"). The two earlier scopes were both wrong in the same direction: a system
# with no stage of its own, or no domain module of its own, stayed invisible to the instrument
# built to find absences. There is no narrower scope that does not have that hole somewhere.
#
# What it deliberately does NOT check is whether a required tree is RIGHT, or complete. That is
# prose, it is the whole value of the atlas, and it is the user's to review.
#
# This file exists by explicit grant (user, 2026-09-03) against check-hygiene.sh's one-script
# rule; see the note beside that rule.
set -uo pipefail
cd "$(dirname "$0")/.."
ATLAS_TREES=$(ls docs/systems/*.md 2>/dev/null | grep -v 'README\.md$' || true)
if [ -n "$ATLAS_TREES" ]; then
  ATLAS_FAIL=0
  ATLAS_CITES=0
  while IFS= read -r cite; do
    [ -z "$cite" ] && continue
    ATLAS_FILE="${cite%%:*}"
    ATLAS_SYM="${cite##*:}"
    ATLAS_CITES=$((ATLAS_CITES + 1))
    if [ ! -f "$ATLAS_FILE" ]; then
      echo "ERROR: atlas cites a file that does not exist: $cite"
      ATLAS_FAIL=1
    elif ! grep -q "\b${ATLAS_SYM}\b" "$ATLAS_FILE"; then
      echo "ERROR: atlas cites a symbol not found in its file: $cite"
      ATLAS_FAIL=1
    fi
  done < <(grep -oh '`src/[A-Za-z0-9_./-]*\.tsx\?:[A-Za-z_][A-Za-z0-9_]*`' $ATLAS_TREES | tr -d '`' | sort -u)
  while IFS= read -r stage; do
    [ -z "$stage" ] && continue
    if ! grep -qF "$stage" $ATLAS_TREES docs/systems/UNMAPPED 2>/dev/null; then
      echo "ERROR: stage '$stage' runs in core.ts and appears in no system tree."
      echo "Add it to the tree of the system it belongs to, or admit it in docs/systems/UNMAPPED."
      ATLAS_FAIL=1
    fi
  done < <(grep -oE "run\('[a-z0-9-]+'" src/engine/simulation/core.ts | sed "s/run('//;s/'//" | sort -u)
  while IFS= read -r mod; do
    [ -z "$mod" ] && continue
    if ! grep -qF "$mod" $ATLAS_TREES docs/systems/UNMAPPED 2>/dev/null; then
      echo "ERROR: '$mod' exists and appears in no system tree."
      echo "Add it to the tree of the system it belongs to, or admit it in docs/systems/UNMAPPED."
      ATLAS_FAIL=1
    fi
  done < <(find src -name '*.ts' -o -name '*.tsx' | sort)
  if [ "$ATLAS_FAIL" -ne 0 ]; then exit 1; fi
  echo "Atlas: $ATLAS_CITES citations resolve; $(find src -name '*.ts' -o -name '*.tsx' | wc -l | tr -d ' ') source files accounted for."
fi

