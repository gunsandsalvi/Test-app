// §7.235 — THE LINTER, AND WHY THESE RULES AND NOT A PRESET.
//
// A code review would have failed this repo for having no linter at all (`"lint": "tsc --noEmit"`
// was a typecheck wearing a lint's name). What it gets is not a style preset — the codebase has a
// consistent voice already and churning it would bury the real diffs. It gets the rules that catch
// the DEFECT CLASSES this project has actually paid for, each one traceable to a §7 record:
//
//   no-explicit-any        §7.235: `companyUpdates: Record<string, any>` erased the element type at
//                          five sites and made a typo a silent `undefined`. 77 remain; this is a
//                          ratchet, so it warns rather than errors until they are gone.
//   no-floating-promises   nothing here is async today, and the rule is what stops that changing
//                          silently in an engine whose determinism depends on ordering. An ERROR;
//                          node:test's `test()`/`describe()`/`it()` return a promise the runner
//                          owns, and are declared safe rather than `void`ed 296 times.
//   no-unnecessary-condition  §7.234 found `if (accExpected > 0)` guarding a value that was always
//                          0, and a check that had never fired in the life of the file; §3.28's NaN
//                          passed every `>` the same way. A WARNING under the gate's
//                          `--max-warnings` — THE RATCHET, struck at the honest count (§4), may
//                          fall and never rise; §3.29-iii/iv pay it.
//   eqeqeq / no-fallthrough   the switch-heavy dispatch §7.229 counted at 75 sites.
//
// §3.29-ii: both type-aware rules were named here and configured nowhere — no `parserOptions.
// project`, so neither could run. `projectService` turns them on (the gate goes from 12 s to 25 s).
//
// Style rules are deliberately absent. This file is for defects.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: new URL('.', import.meta.url).pathname } },
    rules: {
      // The two type-aware rules this project paid for (the header). A floating promise is a
      // defect; the runner's own test calls are the one known-safe shape.
      '@typescript-eslint/no-floating-promises': ['error', {
        allowForKnownSafeCalls: [{ from: 'package', package: 'node:test', name: ['test', 'describe', 'it'] }],
      }],
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      // THE RATCHET. 77 today; this may fall and never rise. When it reaches zero, make it an error.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Real defects, not style.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-fallthrough': 'error',
      // WARN, not error, and deliberately. All 20 of these are `let x = <initial>` overwritten
      // before any read — a declare-then-assign style, not a defect. Churning twenty sites to
      // satisfy a rule that found no bug is how a linter loses its authority; this file is for
      // defects, and a warning still shows the count.
      'no-useless-assignment': 'warn',
      'no-constant-condition': 'error',
      'no-self-compare': 'error',
      'no-unmodified-loop-condition': 'error',
      // The engine names things it does not always use; unused ARGS are how a signature documents
      // itself. Unused local variables are still worth knowing about.
      '@typescript-eslint/no-unused-vars': ['warn', {
        args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none',
      }],
      // Off: the codebase uses these deliberately and consistently.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
);
