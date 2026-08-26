#!/usr/bin/env bash
set -e

# Check for root-level scratch/migration scripts
VIOLATIONS=$(ls fix_* patch_* debug_* parse_* test_script.* 2>/dev/null || true)

if [ -n "$VIOLATIONS" ]; then
  echo "ERROR: Hygiene violation! Root-level scratch or migration scripts found:"
  echo "$VIOLATIONS"
  echo "Please delete them before running verification."
  exit 1
fi

echo "Repo hygiene check passed."
