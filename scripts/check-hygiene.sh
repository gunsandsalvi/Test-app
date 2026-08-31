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

# 3. §5-STRUCT step 1 — THE LEDGER OWNS MONEY. A balance is written in one place, or conservation
#    is not an invariant but a habit that every author has to share (§7.229, corrected in §7.230).
#    A WRITE is a property assignment — `x.cashUSD = / += / -=` — never a local declaration; the
#    first version of this rule counted `const cashUSD = ...` and reported three times the real
#    number. `initialization.ts` builds the opening world and is allowed to; everything else routes
#    through engine/ledger.
MONEY_FIELDS='(cashUSD|cashReservesUSD|depositsUSD|corporateDepositsUSD|institutionalDepositsUSD|smeDepositsUSD|unmodeledDepositsUSD|wholesaleFundingUSD)'
# Owners of a balance: the ledger, the two bootstraps that build the opening world, and (until the
# migration finishes) settlement's own apply pass and bank-lending's funding composition.
LEDGER_OWNED='^src/engine/ledger/|^src/engine/simulation/initialization\.ts:|^src/engine/macro/initialization\.ts:|^src/engine/simulation/stages/settlement\.ts:|^src/engine/simulation/stages/bank-lending\.ts:'
STRAY=$(grep -rnE "(\.|\][[:space:]]*)${MONEY_FIELDS}[[:space:]]*(=[^=>]|\+=|-=)" src --include=*.ts 2>/dev/null \
  | grep -vE "$LEDGER_OWNED" \
  | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|\*|/\*)' || true)
STRAY_COUNT=$(printf '%s' "$STRAY" | grep -c . || true)
# THE RATCHET: this may fall, never rise. Lower it as sites migrate; at 0, withdraw the allowances
# above one at a time and the rule becomes absolute.
# The two that remain are NOT balances and share a field name with one, which is its own defect:
#   estate-resolution  `estate.assets.cashUSD`      — an estate's asset SNAPSHOT; the money already moved
#   holdings-view      `institutionalSector.cashUSD` — a derived sector AGGREGATE, a view not a holding
# Closing them means giving each its own type so the name cannot collide. Until then they are named
# here rather than allow-listed by file, so the budget still means what it says.
MONEY_WRITE_BUDGET=2
if [ "$STRAY_COUNT" -gt "$MONEY_WRITE_BUDGET" ]; then
  echo "ERROR: $STRAY_COUNT money-field writes outside engine/ledger (budget $MONEY_WRITE_BUDGET)."
  echo "$STRAY"
  echo "Route the movement through engine/ledger's post(). See §5-STRUCT step 1."
  exit 1
fi

# 4. §5-STRUCT — the test tree is PURE. Anything that runs a world is a harness module, not a test.
if [ -d test ]; then
  IMPURE=$(grep -rlE "advanceWeeklyStep|createInitialGameState" test --include=*.ts 2>/dev/null || true)
  if [ -n "$IMPURE" ]; then
    echo "ERROR: test/ may hold only pure-function tests over domain/. These run a world:"
    echo "$IMPURE"
    echo "Fold them into scripts/harness.ts as a module."
    exit 1
  fi
fi

echo "Repo hygiene check passed."
