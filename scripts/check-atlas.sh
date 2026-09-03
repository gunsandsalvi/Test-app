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
#   COVERAGE — every stage core.ts runs is in a tree or admitted in docs/systems/UNMAPPED, so a
#     NEW system cannot ship undescribed. UNMAPPED's length is how far along the atlas is.
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
  if [ "$ATLAS_FAIL" -ne 0 ]; then exit 1; fi
  echo "Atlas: $ATLAS_CITES citations resolve; every core.ts stage is accounted for."
fi

