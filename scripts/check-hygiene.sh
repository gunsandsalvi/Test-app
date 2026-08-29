#!/usr/bin/env bash
set -e

# 1. No root-level scratch/migration scripts.
VIOLATIONS=$(ls fix_* patch_* debug_* parse_* test_script.* split.* assemble.* build_*.cjs *_comments.txt assembled_*.txt all_stages.txt 2>/dev/null || true)
if [ -n "$VIOLATIONS" ]; then
  echo "ERROR: Hygiene violation! Root-level scratch or migration scripts found:"
  echo "$VIOLATIONS"
  echo "Please delete them before running verification."
  exit 1
fi

# 2. ONE test script, enforced (user directive 2026-08-29). All checks, batteries and profiling
#    live in scripts/harness.ts as modules — add a module there, never a second script.
EXTRA=$(ls scripts/ | grep -vE '^(harness\.ts|check-hygiene\.sh)$' || true)
if [ -n "$EXTRA" ]; then
  echo "ERROR: scripts/ may contain ONLY harness.ts and check-hygiene.sh. Found:"
  echo "$EXTRA"
  echo "Fold the logic into scripts/harness.ts as a module (see its header)."
  exit 1
fi

echo "Repo hygiene check passed."
