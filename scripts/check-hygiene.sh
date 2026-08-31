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
MONEY_FIELDS='(cashUSD|cashReservesUSD|depositsUSD|corporateDepositsUSD|institutionalDepositsUSD|smeDepositsUSD|unmodeledDepositsUSD|wholesaleFundingUSD|bankEquityUSD)'
# Owners of a balance: the ledger, the two bootstraps that build the opening world, and (until the
# migration finishes) settlement's own apply pass and bank-lending's funding composition.
# bank-identity-trace is a READ-ONLY instrument (BANK_IDENTITY_TRACE=1): it rebuilds the harness's
# identity residual per stage and mutates nothing — its field maps trip the spread regex without
# being writes.
LEDGER_OWNED='^src/engine/ledger/|^src/engine/simulation/initialization\.ts:|^src/engine/macro/initialization\.ts:|^src/engine/simulation/stages/settlement\.ts:|^src/engine/simulation/stages/bank-lending\.ts:|^src/engine/simulation/bank-identity-trace\.ts:'
STRAY=$(grep -rnE "(\.|\][[:space:]]*)${MONEY_FIELDS}[[:space:]]*(=[^=>]|\+=|-=)" src --include=*.ts --include=*.tsx 2>/dev/null \
  | grep -vE "$LEDGER_OWNED" \
  | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|\*|/\*)' || true)
STRAY_COUNT=$(printf '%s' "$STRAY" | grep -c . || true)
# §7.241 — THE FORM THE OLD REGEX COULD NOT SEE. The codebase's dominant balance write is the
# object-literal/spread rebuild — `cashUSD: (e.cashUSD ?? 0) + x` — which has no `=` to match, so
# "budget 2" governed almost none of the real writes and the etf-flows bypass ran for months
# unseen. This counts a money field given a COMPUTED value inside an object literal (a `:`
# followed by an expression that does arithmetic or reads another field), excluding type
# declarations (`: number`), plain copies (`cashUSD: cashUSD`, `cashUSD: 0`), and comments.
# `sumField(` marks the 02b regional-aggregate DERIVED VIEW (a sum over the per-bank sheets,
# §7.241's exhaustive rebuild) — a projection, not a balance write; the BankBook/View split
# retires the exemption with the fused type.
SPREAD_STRAY=$(grep -rnE "${MONEY_FIELDS}[[:space:]]*:[[:space:]]*[^,}]*(\+|-[^-]|\*|\?\?)" src --include=*.ts --include=*.tsx 2>/dev/null \
  | grep -vE "$LEDGER_OWNED" \
  | grep -v "sumField(" \
  | grep -vE "${MONEY_FIELDS}[[:space:]]*:[[:space:]]*(number|Number\(|Math\.(round|abs|max\(0))" \
  | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|\*|/\*)' || true)
SPREAD_STRAY_COUNT=$(printf '%s' "$SPREAD_STRAY" | grep -c . || true)
# THE RATCHETS: each may fall, never rise. Lower them as sites migrate; at 0, withdraw the
# allowances above one at a time and the rule becomes absolute.
# The assignment-form survivors are NOT balances and share a field name with one (its own defect):
#   estate-resolution  `estate.assets.cashUSD`      — an estate's asset SNAPSHOT; the money already moved
#   holdings-view      `institutionalSector.cashUSD` — a derived sector AGGREGATE, a view not a holding
# plus the bankEquityUSD sites newly under guard (13 writer files, §7.241 — bookPnL() is their exit).
MONEY_WRITE_BUDGET=3
if [ "$STRAY_COUNT" -gt "$MONEY_WRITE_BUDGET" ]; then
  echo "ERROR: $STRAY_COUNT money-field writes outside engine/ledger (budget $MONEY_WRITE_BUDGET)."
  echo "$STRAY"
  echo "Route the movement through engine/ledger's post(). See §5-STRUCT step 1."
  exit 1
fi
# §7.275 ratcheted 23 → 16: the bookPnL migration took the stage-side bankEquityUSD spread
# rebuilds out (dealer-desks, 07c, 07f, bill-accretion, sovereign-calendar, trade,
# estate-resolution). The 16 left are the split/absorb stock transfers, 02b's gated reconcile,
# and the evolution seams — each waiting on its named gate, none of them P&L.
MONEY_SPREAD_BUDGET=16
if [ "$SPREAD_STRAY_COUNT" -gt "$MONEY_SPREAD_BUDGET" ]; then
  echo "ERROR: $SPREAD_STRAY_COUNT spread-form money writes outside engine/ledger (budget $MONEY_SPREAD_BUDGET)."
  echo "$SPREAD_STRAY"
  echo "A balance rebuilt in an object literal is still a write. Route it through pay()/post()."
  exit 1
fi

# 4. §5-STRUCT step 4 — TYPE UNIONS ARE REGISTRIES, NOT SWITCHES. A literal comparison against a
#    union member is a case that the compiler will not point you at when a member is added — and
#    §7.229 counted AssetType at 75 sites across 17 files, PartyRef.kind at 69 across 19. Facts
#    about a kind belong in its registry (domain/assets, engine/ledger/parties); genuinely
#    per-kind BEHAVIOUR may still switch, which is why this is a ratchet and not a ban.
ASSET_MEMBERS="'EQUITY'|'CORP_BOND'|'LEVERAGED_LOAN'|'SOV_BOND'|'GOV_BOND'|'COMMERCIAL_PAPER'|'PE_FUND_INTEREST'|'ETF_SHARE'"
REGISTRY_OWNED='^src/domain/assets/|^src/engine/ledger/parties\.ts:'
ASSET_SWITCH=$(grep -rnE "(===|!==|case )[[:space:]]*(${ASSET_MEMBERS})" src --include=*.ts 2>/dev/null \
  | grep -vE "$REGISTRY_OWNED" | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|\*|/\*)' || true)
ASSET_SWITCH_COUNT=$(printf '%s' "$ASSET_SWITCH" | grep -c . || true)
# THE RATCHET: may fall, never rise.
ASSET_SWITCH_BUDGET=64
if [ "$ASSET_SWITCH_COUNT" -gt "$ASSET_SWITCH_BUDGET" ]; then
  echo "ERROR: $ASSET_SWITCH_COUNT literal comparisons against an instrument type (budget $ASSET_SWITCH_BUDGET)."
  echo "$ASSET_SWITCH" | head -20
  echo "Ask the registry (domain/assets) for the FACT; switch only on genuine per-kind behaviour."
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
