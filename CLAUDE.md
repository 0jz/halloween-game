# CLAUDE.md

Conventions for anyone, human or agent, changing this repository. Keep this file short; the reasoning behind each rule lives in `context/product/architecture.md`.

## What this is

A TypeScript canvas game (Dino Runner) with no framework and no runtime dependencies, built with the AWOS spec-driven workflow. The documents in `context/` are not decoration: the spec is the contract, and the code is expected to match it.

## Commands

```bash
npm install      # dependencies only; no downloads beyond npm
npm run dev      # Vite dev server on :5173
npm test         # tsc --noEmit, then Vitest
npm run e2e      # Playwright smoke test (installs Chromium on first run via pree2e)
npm run lint     # ESLint + Prettier check
npm run check    # lint + test + e2e (CI runs exactly this)
```

Node 22 LTS (`.nvmrc`). While iterating, run a single test file. Run the full `npm test` once at the end as evidence.

## Architecture rules (non-negotiable)

- **Pure logic has no DOM access.** Only `src/main.ts`, `src/render.ts` and the keyboard adapter `src/input-dom.ts` may touch `window`, `document`, `localStorage`, `performance`, `requestAnimationFrame`, timers or the canvas. ESLint enforces this; do not add exceptions. The localStorage high-score adapter lives in `main.ts` behind the `HighScoreStore` interface.
- **Gameplay emits, features subscribe.** Cross-cutting behaviour goes through the typed bus in `src/events.ts`. Extend the `GameEvent` union; never add ad-hoc callbacks or reach into `game.ts` from a feature. `emit` is synchronous inside a step. A feature that needs time uses `state.tick` or the `tick` event, never the wall clock.
- **Features own their state.** A cosmetic feature is `installX({ game, renderer })` returning `dispose()`: its state lives in a closure, resets on `start` and `restart`, and is drawn from a layer callback. Never write to `GameState` or keep module-level state. Animations on the frozen game-over screen use the render frame counter given to draw callbacks; visual randomness uses the feature's own `createRng(state.seed ^ SALT)`, never the game's `Rng`.
- **Draw in layers.** `renderer.addLayer(layer, draw)`; layers run `background`, `parallax`, `world`, `foreground`, `hud` in that order, each callback wrapped in save/restore, logical 800 by 300 coordinates. Screen shake goes through `renderer.setCamera`. Rendering never mutates state and never emits.
- **Deterministic by construction.** All randomness through the `Rng` in game state; all time is the tick counter. No `Math.random()`, `Date.now()`, `performance.now()`, `setTimeout` or `setInterval` under `src/` except in `main.ts`. A seeded page (`?seed=N`) replays the same course; the seed is re-applied on every restart.
- **Fixed timestep.** `game.tick(n)` advances exactly n steps of 1/60 s. `game.frame(nowMs)` is the accumulator the browser uses, clamped to 100 ms per frame.
- **Restart is a full reset.** Seed and `Rng`, speed, spawn timer, obstacles, score, dino and HUD are rebuilt from `tuning.ts`. Only the persisted high score survives.
- **HUD is state.** Hint text, game-over flag, blink visibility, dino pose and run frame are computed in `game.ts`; `render.ts` paints them verbatim.
- **Numbers live in `tuning.ts`.** Any constant the spec quotes is a named export there; tests assert against the name, not a literal.
- **Strict TypeScript.** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` stay on. No `any`, no `as` casts, no `@ts-ignore`, no `enum` (use `as const` objects). Every `switch` on a union ends in `assertNever`.

## Testing contract (frozen)

Section 3 of `context/product/architecture.md` defines the public testing surface: `createGame(deps)` returning `tick`, `frame`, `dispatch`, `state()`, `view()`, `on`; the `GameState` fields and their semantics; the `GameEvent` union and when each event fires; the `tuning.ts` export names; `createKeyboard()`, `createRng()`, `parseSeed()`, `formatScore()`, `addLayer()`, `setCamera()`; and the read-only `window.__dino` hook, `canvas#game` and the `dino.hi` storage key. Tests outside this repository import these names. You may add to them. You may not rename or remove them.

## Tests

- Unit tests: `tests/<module>.test.ts`, mirroring `src/`, Vitest in Node. Acceptance-level tests drive `createGame` with a stubbed `randomSeed`, an in-memory store and `tick(n)`.
- End-to-end: `e2e/smoke.spec.ts`, Playwright, Chromium, one test. It proves wiring only (page load, canvas size, key handling, the real clock, localStorage round trip). Anything a unit test can prove does not go here.
- A new test must fail before the change it covers and pass after (RED validation).

## Workflow

- Features go through AWOS: `/awos:spec` → `/awos:tech` → `/awos:tasks` → `/awos:implement` → `/awos:verify`. Specs live in `context/spec/NNN-name/`. The functional spec stays in user language; tick-level test mappings belong in the technical considerations.
- Small, well-scoped fixes use plan mode instead of a spec. If a fix changes documented behaviour, amend the spec with `/awos:spec NNN: <what changed>` so the contract stays true.
- Never edit anything under `.awos/`; it is reinstalled on update. `.claude/commands/awos/` is the customisation layer.
- Do not commit secrets, `node_modules/`, or `dist/`.
