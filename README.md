# Codeference Dino Runner

A browser version of the classic "no internet" dinosaur game: open the page, press SPACE, jump over pumpkins, beat your high score, in a Halloween edition. Built in TypeScript on an HTML5 canvas with no framework and no runtime dependencies.

It is also the practice codebase for the Codeference workshop on Claude Code and spec-driven development with [AWOS](https://github.com/provectus/awos). The repository is small on purpose: every game rule lives in a pure, unit-tested module, and the documents that led to the code are in `context/`.

**Status:** the core game is complete and playable. Its spec, `context/spec/001-core-game/`, went through the full AWOS cycle and is marked Completed.

## Quick start

Requires Node 22 LTS.

```bash
npm install        # dependencies, and turns on the git pre-commit secret scan
npm run dev        # start the dev server and open the game
npm test           # type check, then unit tests
npm run e2e        # one Playwright smoke test (downloads Chromium on first run)
npm run check      # lint + test + e2e, what CI runs
```

## How to play

- SPACE or UP arrow starts a run, jumps, and restarts after a crash.
- DOWN arrow ducks while you are on the ground, to pass under bats.
- The pace rises the longer you survive, and the night sky darkens with a moon, stars and glowing eyes. Bats appear after about 25 seconds. Jump into the witch's hat that floats at jump height from about 30 seconds, then eat the candies that follow: each gives a heart (up to three) that lets you survive a crash, with 1.5 seconds of protection. Your best score is remembered by your browser.
- Add `?seed=42` (any whole number) to the page address to get the same course every run. Useful for practice, for comparing with a friend, and for tests.

## Project layout

```
src/            game code, TypeScript modules (see context/product/architecture.md)
tests/          Vitest unit tests for the pure modules
e2e/            Playwright smoke test
context/
  product/      product-definition.md, architecture.md
  spec/         one folder per feature: functional spec, technical considerations, tasks
.awos/          AWOS framework files (do not edit; reinstalled on update)
.claude/        Claude Code commands, hooks and settings; agents and skills you add go here too
.githooks/      git pre-commit hook (secret scan), enabled by npm install
.workshop/      your activity log
CLAUDE.md       conventions for anyone, human or agent, changing this code
```

## Your activity log

While you work in Claude Code in this repository, your session is recorded in `.workshop/activity.jsonl`: your prompts, the tools Claude used and the files it changed. It is yours to review: run `/activity` in Claude Code for a readable timeline, or ask it a question such as `/activity what did I ask before the plan?`. In a terminal, `npm run activity` prints the same timeline (`npm run activity -- --all` also shows file reads).

The log is also how the workshop scores the process steps, so it is committed with your work. It never records file contents or Claude's answers, prompts are cut at 500 characters, and anything that looks like a key is replaced with `[REDACTED]`. Each line carries a hash of the line before it, so the timeline tells you if the log was changed after it was written.

Claude Code keeps fuller transcripts of your sessions on your own machine (`/resume` reopens one). Those never leave your computer; the activity log is the short summary that lives in the repository.

The log is written by Claude Code hooks in `.claude/hooks/`, configured in `.claude/settings.json`.

## Keeping keys out of the repository

Your repository will be public. Your gateway key belongs in environment variables (`ANTHROPIC_AUTH_TOKEN`), never in a file here. Two checks stop accidents:

- **In Claude Code**, a hook blocks writing anything that looks like a key into a file git would commit, and blocks `git commit` and `git push` when the changes contain one. Claude tells you what it found and where.
- **Outside Claude Code**, a git pre-commit hook in `.githooks/` runs the same scan on every commit. `npm install` turns it on.

Files that git ignores, such as `.env`, are not blocked. If a match is a false positive, add the comment `secret-scan: allow` on that line. These checks recognise common key formats, not every secret: they are a safety net, not a guarantee.

## How this repository is built

Every feature follows the AWOS cycle inside Claude Code: `/awos:spec` (what the player gets) → `/awos:tech` (how it will be built) → `/awos:tasks` → `/awos:implement` → `/awos:verify`. Small fixes skip the cycle and use Claude Code's plan mode. Read `context/spec/001-core-game/` to see a complete example of the documents before the code.

## License

MIT, see `LICENSE` (added with the first release).
