---
name: ci-parity-check
description: Run the same checks CI runs (lint, Prettier, type-check, Vitest, Playwright) in the right way on this Windows checkout before committing or pushing, and say clearly what passed, what failed and what is a known local-only failure. Use before every commit or push, when asked to "check", "verify", "run CI locally", or when a GitHub Actions `check` run failed.
---

# CI parity check

CI runs exactly `npm ci && npm run check` on Linux, which is `npm run lint`, then `npm test`, then `npm run e2e`, and **stops at the first failing step**. A lint failure therefore hides every test and e2e result behind it. Run the steps below in order, locally, before pushing.

## Why plain `npm run lint` is not enough here

This checkout is on Windows with `core.autocrlf`, so working-copy files have CRLF endings while CI sees LF. Plain `prettier --check .` then flags ~47 files that CI considers fine, and it is easy to start ignoring it, which is how real formatting errors slipped through. Use `--end-of-line auto` to match CI.

## Steps

1. **Lint, CI-equivalent.** Both must be clean:
   ```bash
   npx eslint .
   npx prettier --check --end-of-line auto .
   ```
   On failure, fix only the files you changed: `npx prettier --write <file>` (this also repairs a missing trailing newline, which is what failed in `.mcp.json`). Never run `prettier --write .` across the repo, and never touch files you did not change.

2. **Unit tests and type-check:**
   ```bash
   npm test
   ```
   Known local-only failure: `tests/hooks/block-secrets.test.ts` "blocks a key written into a tracked project file" fails on Windows because `node:path` yields `src\config.ts` where the test expects `src/config.ts`. It passes on Linux CI. Report it as known and unrelated, and do not edit it. Any other failure is real.

3. **End-to-end (when `src/main.ts`, `src/render.ts`, `src/input-dom.ts`, `index.html`, CSS or `e2e/` changed):**
   ```bash
   npm run e2e
   ```
   The first run downloads Chromium and can take many minutes; run it in the background and wait for it. A timeout at "phase === 'dead'" while the machine is busy is load, not a regression; re-run before concluding anything.

4. **Test integrity.** For a bug fix, confirm the new test failed before the fix (RED) and no existing test was skipped or deleted: search `tests/` and `e2e/` for `.skip`, `.only`, `.todo`, `xit`, `fixme`, and compare `git diff --stat` for removed tests.

5. **Stage precisely.** Use `git add <paths>`, not `git add -A`. `.workshop/activity.jsonl` is rewritten by the activity hooks and `.idea/` is IDE state; neither belongs in a fix commit.

## Report

State, per step: pass, fail, or known local-only failure, with the failing file and message for anything red. Do not claim CI will pass unless steps 1 and 2 are clean apart from the known failure. After a push, confirm with `gh run list --limit 3`; the `pages` job being "skipped" is expected outside `provectus/codeference-dino-game`.
