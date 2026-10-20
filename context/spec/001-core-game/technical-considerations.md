# Technical Specification: Core Game

- **Functional Specification:** [functional-spec.md](./functional-spec.md)
- **Status:** Completed
- **Author(s):** Daria Garanina

Choices marked **Assumption:** were made by the author without a confirmed answer and are the first things to challenge in review. The frozen names (`createGame`, `GameState`, `GameEvent`, the `tuning.ts` export names, `window.__dino` and friends) and their semantics are defined once in [architecture.md section 3](../../product/architecture.md) and are referenced here, not repeated. This document owns the exact configuration.

---

## 1. High-Level Technical Approach

This is the first and only implementation cycle for the whole game, so it also scaffolds the project. The work splits into three layers that can be built and tested bottom-up:

1. **Pure simulation** (`tuning`, `rng`, `physics`, `obstacles`, `collision`, `score`, `sprites`, `events`, `input`, `game`): plain TypeScript over plain objects, no DOM, fully covered by Vitest. `createGame(deps)` is the single entry point; one call to `tick()` advances the world by 1/60 s. Every acceptance criterion about rules, timing, scoring, restart and replay is proven at this layer by stepping a seeded game and inspecting `state()`.
2. **Browser shell** (`main`, `render`, `input-dom`): wires the simulation to `requestAnimationFrame`, the canvas, the keyboard and `localStorage`, and installs the `window.__dino` hook. Deliberately thin, so that one Playwright smoke test is enough.
3. **Tooling**: Vite, TypeScript, Vitest, Playwright, ESLint and Prettier configured once, with `npm run check` as the only thing CI runs.

No build-time code generation, no state library, no rendering library.

---

## 2. Proposed Solution & Implementation Plan (The "How")

### 2.1 Project scaffolding

| Path | Purpose |
|---|---|
| `package.json` | `"type": "module"`, `engines.node >= 22.13`, scripts `dev`, `build`, `preview`, `typecheck` (`tsc -p tsconfig.json && tsc -p tsconfig.node.json`), `test` (`npm run typecheck && vitest run`), `e2e:install`, `pree2e`, `e2e`, `lint`, `format`, `check`. Dev dependencies: `typescript`, `@types/node`, `vite`, `vitest`, `@vitest/coverage-v8`, `@playwright/test`, `eslint`, `typescript-eslint`, `eslint-config-prettier`, `prettier`. Versions pinned exactly at implementation time. |
| `.nvmrc` | `22` |
| `tsconfig.json` | `src/` only. `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `types: ["vite/client"]`, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noImplicitOverride`, `verbatimModuleSyntax`, `isolatedModules`, `noEmit`, `skipLibCheck`. `include: ["src"]`. |
| `tsconfig.node.json` | Same flags, `types: ["node"]`, same `lib` (tests import `src/` types that mention the canvas). `include: ["tests", "e2e", "*.config.ts"]`. |
| `vite.config.ts` | `defineConfig` from `vitest/config`; `server.port 5173`, `preview.port 4173`, `base` from `process.env.BASE_PATH ?? '/'`, `test: { environment: 'node', include: ['tests/**/*.test.ts'], coverage: { provider: 'v8', reporter: ['text'] } }`. |
| `playwright.config.ts` | `testDir: 'e2e'`, one Chromium project, viewport 1280 by 800, `retries: 0`, `webServer: { command: 'npm run build && npm run preview -- --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: false }`. |
| `eslint.config.js` | Flat config: `strictTypeChecked` and `stylisticTypeChecked` with `parserOptions.projectService` and `allowDefaultProject: ['eslint.config.js']`; `tseslint.configs.disableTypeChecked` for `**/*.js`; `consistent-type-assertions: ['error', { assertionStyle: 'never' }]`; `no-confusing-void-expression` with `ignoreArrowShorthand: true`. For `src/**` except `main.ts`, `render.ts`, `input-dom.ts`: `no-restricted-globals` for `window`, `document`, `localStorage`, `performance`, `requestAnimationFrame`, `setTimeout`, `setInterval`, `globalThis`, `self`, `location`, `navigator`, `addEventListener`. For `src/**` except `main.ts`: `no-restricted-properties` for `Math.random`, `Date.now`, `performance.now`, and `no-restricted-syntax` for `NewExpression[callee.name='Date']`. `eslint-config-prettier` last. |
| `.prettierrc` | Defaults plus `singleQuote: true`. **Assumption.** |
| `index.html` | A `<main>` wrapper, one `<canvas id="game" width="800" height="300">`, a `<noscript>` line, and a `<link>` to `src/style.css`. No text outside the canvas except `<title>`. |
| `src/style.css` | Centres the canvas; CSS width `min(800px, 100vw − 32px, (100vh − 32px) · 8/3)` with `aspect-ratio: 8 / 3`, so it is 800 by 300 at most and shrinks to fit smaller windows; `image-rendering: pixelated`; page background equal to `PALETTE.bg`. |
| `src/global.d.ts` | `declare global { interface Window { __dino: DinoHook } }` with `DinoHook` from `types.ts`. |
| `.github/workflows/check.yml` | One job, Node 22, `npm ci && npm run check`. **Assumption** per architecture. |

### 2.2 Module contracts

Only exports beyond the frozen contract are listed. Signatures are indicative; the implementer keeps them in the module and adds to `types.ts` only what two or more modules share.

| Module | Exports (beyond the frozen contract) | Notes |
|---|---|---|
| `tuning.ts` | The `as const` constants in the table in 2.3 | Imported by `game`, `obstacles`, `physics`, `score`, `render`, and by tests. |
| `rng.ts` | `createRng`, `parseSeed` (frozen); `nextRandom(state: number): [value: number, state: number]` | mulberry32 as a pure function over a `uint32` state; `createRng` wraps it in a closure for callers outside `game.ts`. `parseSeed` matches `/^\d+$/` and requires the value to be at most `MAX_SEED`; otherwise `undefined`. |
| `events.ts` | `createBus(): EventBus` | Handlers stored per event type in a `Set` (registering the same handler twice keeps one). `emit` iterates a copy so a handler may unsubscribe itself. A throwing handler does not stop the others; the error is rethrown from `queueMicrotask`, so the smoke test sees it as a page error and the frame loop keeps running. |
| `sprites.ts` | `Sprites` object: `dinoStand`, `dinoRun0`, `dinoRun1`, `dinoHit`, `cactusSmall`, `cactusLarge`, `ground`; each `{ bitmap: readonly string[]; width; height; hitbox: Rect; runs: readonly Rect[] }` | Bitmaps are hand-drawn ASCII in the source, 1 character per logical pixel; `runs` are the horizontal pixel runs, computed once at module load, that `render.ts` fills. Dino is about 44 by 47, small cactus 17 by 35, large cactus 25 by 50 (the proportions of the original). Hitboxes are inset: dino excludes the tail and the head overhang; cacti exclude arm tips. |
| `physics.ts` | `applyGravity(dino) → dino`, `startJump(dino) → dino`, `isOnGround(dino)` | Vertical only. Jump is a fixed impulse; no variable-height jump. |
| `obstacles.ts` | `speedAt(tick): number`, `advanceObstacles(obstacles, speed)`, `shouldSpawn(run)`, `makeGroup(rngState, speed, nextId, group)`, `nextGapPx(rngState, speed)`, `firstSpawnX(rngState)` | All take and return plain data, including the new `rngState`. The spawn timer is a position target (`nextSpawnX`), not a time, so gaps scale with speed. `firstSpawnX` places the first group so that it reaches the dinosaur (architecture section 3) within `FIRST_ARRIVAL_TICKS` at `START_SPEED`. |
| `collision.ts` | `intersects(a: Rect, b: Rect)`, `hasCollision(dino, obstacles)` | AABB on hitboxes only. |
| `score.ts` | `advanceScore(distance, speed)`, `isMilestone(before, after)`, `formatScore` (frozen) | The exact float `distance` lives in `RunState`; `GameState.score` is `min(floor(distance), MAX_SCORE)`. |
| `game.ts` | `createGame` (frozen); internal `step(run: RunState, intent: Intent \| undefined) → { run, events }` | The only module that owns run state. `RunState` holds the public fields plus `rngState`, `distance`, `nextSpawnX`, `blinkStartedAt`, `nextObstacleId`, `nextGroup`. `state()` returns `structuredClone(project(run))`; `view()` returns `project(run)` without copying. A guard flag makes `tick` and `frame` throw when called from inside an emit. |
| `input.ts` | `createKeyboard` (frozen), `PRIMARY_CODES` | The reducer keeps a `Set` of held codes. `PRIMARY_CODES` is the one list of jump keys; `input-dom.ts` reuses it for `preventDefault`. |
| `input-dom.ts` | `attachKeyboard(target: Window, keyboard, onIntent): { dispose(): void }` | Listens for `keydown`, `keyup`, `blur` and `visibilitychange`. |
| `render.ts` | `createRenderer(canvas)` with `addLayer`, `setCamera`, `draw` (frozen), `dispose()` | Registers the built-in drawers through `addLayer` itself: in `world`, ground then obstacles then dino; in `hud`, score, hint, game over. Keeps the `RenderFrame` counter, incremented once per `draw`. |
| `store.ts` | `createMemoryStore`, `createStorageStore(storage, key)` | Persistence rules in 2.7; pure, the storage is passed in. |
| `assert.ts` | `assertNever` | Shared exhaustiveness check for every `switch` on a union. |
| `main.ts` | none (side effects only) | Bootstrap order in 2.6. |

### 2.3 Tuning values (the spec's numbers, as constants)

Export names are frozen (architecture section 3); values may be retuned.

| Constant | Value | Spec criterion it serves |
|---|---|---|
| `STEP_SECONDS` | `1/60` | fixed timestep |
| `CANVAS` | `{ width: 800, height: 300 }` | 2.9 |
| `PALETTE` | `{ bg: '#f7f7f7', fg: '#535353', accent: '#c4302b' }` (accent only for the game-over puddle) | 2.9, 2.5 |
| `PUDDLE` | `{ width: 60, growFrames: 30 }` (render frames; about 0.5 s at 60 Hz) | 2.5 |
| `GROUND_Y` | `260` (logical px, top of the ground line) | layout |
| `DINO_X` | `50` | layout |
| `START_SPEED` | `6` px per step | 2.3, 2.4 |
| `MAX_SPEED` | `12` px per step (2x) | 2.4 |
| `MAX_SPEED_AT_TICK` | `5400` (90 s) | 2.4 |
| `JUMP_DURATION_TICKS` | `36` (0.6 s) | 2.2 |
| `JUMP_HEIGHT_PX` | `70` | playability; gravity and impulse are derived from height and duration |
| `FIRST_ARRIVAL_TICKS` | `[90, 150]` (1.5 to 2.5 s): ticks at which the first obstacle reaches the dinosaur | 2.3, 2.7 |
| `REACTION_TICKS` | `30` (0.5 s) | 2.3 |
| `MIN_GAP_FACTOR` | gap ≥ `speed * (JUMP_DURATION_TICKS + REACTION_TICKS)` px | 2.3 |
| `MAX_GAP_FACTOR` | `2.5` times the minimum gap | variety |
| `MAX_GROUP_SIZE` | `3` | 2.3 |
| `LARGE_CACTUS_PROBABILITY` | `0.35` **Assumption** | 2.3 |
| `SCORE_PER_SECOND` | `10` at `START_SPEED`; per tick `SCORE_PER_SECOND / 60 * speed / START_SPEED` | 2.6 |
| `MAX_SCORE` | `99999` | 2.6 |
| `MILESTONE_EVERY` | `100` | 2.6 |
| `BLINK_SCHEDULE` | hidden on ticks 0 to 9, 20 to 29, 40 to 49 after a milestone | 2.6 |
| `RUN_FRAME_TICKS` | `6` | 2.2 |
| `FRAME_CLAMP_MS` | `100` | 2.9 (hidden tab) |
| `MAX_SEED` | `2 ** 32 - 1` | 2.8 |

Speed ramp: linear, `speed(tick) = START_SPEED * (1 + min(tick, MAX_SPEED_AT_TICK) / MAX_SPEED_AT_TICK)`. This gives 1.33x at tick 1800, which satisfies "about 1.3x at 30 s" without a second curve. `speedChange` is emitted when `floor(speed / START_SPEED * 10)` changes.

### 2.4 The step algorithm

`step` runs in this fixed order every tick. The order is part of the contract because tests assert "on the same tick".

1. Take at most one queued intent; drop the rest. Interpret `primary` by phase (architecture 2.2 Input model). A start or restart builds a fresh run from `tuning.ts` (seed from `deps.seed` or one call to `deps.randomSeed()`, `rngState` from the seed, `tick = 0`, `speed = START_SPEED`, `nextObstacleId = 0`, `nextGroup = 0`, `nextSpawnX` from `firstSpawnX`), emits `start` (from `idle`) or `restart` (from `dead`), and returns. Nothing moves on this step.
2. If `phase !== 'running'`, return the run unchanged and emit nothing (the frozen game-over screen).
3. `tick += 1`; `speed = speedAt(tick)`; emit `speedChange` if the 0.1x bucket changed.
4. If the intent was a jump and the dino is on the ground, apply it; emit `jump`.
5. Apply gravity; if the dino landed this tick, emit `land`.
6. Advance obstacles by `speed`; drop those with `x + width < 0`.
7. If `shouldSpawn`, append a group with consecutive ids and one shared `group`, add one `spawnLog` entry per obstacle, emit `spawn` per obstacle.
8. Advance `distance`; derive `score`, clamped to `MAX_SCORE`; if a multiple of `MILESTONE_EVERY` was crossed, set `blinkStartedAt = tick` and emit `milestone` with that multiple.
9. Collision check, skipped when `deps.collisions === false`. On hit: `phase = 'dead'`, `dino.pose = 'hit'`; if `score > (hi ?? 0)`, call `store.save(score)` and set `hi = score`; emit `die` with the final `score`, `highScore` equal to `hi` after the death (0 when it is still `null`), and `isNewHighScore` true exactly when `save` was called.
10. Derive HUD and animation fields: `hint` (`'start'` in `idle`, `'restart'` in `dead`, else `null`), `gameOver`, `blinkVisible` (always `true` outside `running`), `dino.frame`, `dino.pose`.
11. Emit `tick`.

`step` returns the events; `game.ts` commits the new run and then emits them in order.

`frame(nowMs)`: the first call records `lastMs` and returns 0. After that, `elapsed = clamp(nowMs - lastMs, 0, FRAME_CLAMP_MS)`; `accumulator += elapsed`; while `accumulator >= STEP_MS - 1e-6` run one step and subtract `STEP_MS`; return the count. A 100 ms gap therefore runs exactly 6 steps.

### 2.5 Rendering

- Built-in layers, all registered through `addLayer`: `world` draws ground tiles scrolled by `scrollX` (the distance the world has moved, the sum of per-step speeds) modulo tile width, then obstacles, then the dino sprite chosen from `pose` and `frame`; `hud` draws `HI 00123` and the score in a bold monospace font right-aligned at the top right, honouring `blinkVisible`, the hint text for `hud.hint` centred, and `GAME OVER` centred above the ground when `gameOver`.
- Sprites are drawn as `fillRect` calls over each sprite's precomputed `runs`, in `PALETTE.fg`. No offscreen canvases, so the renderer runs against a fake `DrawContext` in Node.
- Text uses `ctx.fillText` with `bold 16px monospace`; no bitmap font. **Assumption.**
- Before layers run: `setTransform(scale, 0, 0, scale, 0, 0)` with `scale = canvas.width / CANVAS.width`, `imageSmoothingEnabled = false`, then clear to `PALETTE.bg`. The camera offset is applied with `translate` around `parallax`, `world` and `foreground`.
- `background`, `parallax` and `foreground` have no built-in drawers in this version. They exist so the next spec can register into them.
- **Game-over puddle** (`src/features/puddle.ts`, installed from `main.ts` with `installPuddle({ game, renderer })`): the first feature in the architecture's "features own their state" shape. It keeps the render frame at which the puddle appeared in a closure, resets it on `start`/`restart`, and draws a four-row pool in `PALETTE.accent` in the `parallax` layer, so the ground line and the dino are painted over it. It grows over `PUDDLE.growFrames` render frames because the simulation is frozen while dead; on a 120 Hz screen that is about 0.25 s. `game.ts` and `render.ts` do not know it exists.

### 2.6 Bootstrap (`main.ts`)

1. `seed = parseSeed(location.search)`.
2. `store = createLocalStorageStore()` (key `dino.hi`, `try/catch` around every access, falls back to `createMemoryStore()`).
3. `bus = createBus()`; `game = createGame({ seed, randomSeed, store, bus })` where `randomSeed = () => Math.floor(Math.random() * 2 ** 32)`.
4. Find the canvas with `document.querySelector('canvas#game')`, check it with `instanceof HTMLCanvasElement` and throw a clear error otherwise (no `as`, no `!`). `fitCanvas(canvas)` keeps the backing store at the displayed size times `devicePixelRatio` (`backingSize` in `render.ts`), re-fitting on a `ResizeObserver` and on `matchMedia` resolution changes (re-subscribed after each change).
5. `renderer = createRenderer(canvas)`; `keyboard = createKeyboard()`; `attachKeyboard(window, keyboard, intent => { game.dispatch(intent); })`.
6. `window.__dino = Object.freeze({ state: () => game.state(), seed, version: 1 })`.
7. `requestAnimationFrame` loop: re-arm first, then `game.frame(performance.now())`, then `renderer.draw(game.view())`.

No module-level side effects anywhere except `main.ts`.

### 2.7 Persistence

`localStorage['dino.hi']` holds a decimal integer string. Read once at startup; absent, non-numeric, negative, fractional or above-`MAX_SCORE` values are treated as `null`. Written only in step 9 under the high score rule, and only when the stored value is still lower than the new score, so a best recorded meanwhile by another tab is never lowered (that other tab's `HI` display updates on its next reload). The pure `createStorageStore` in `store.ts` implements this; `main.ts` hands it `localStorage`. No other keys.

---

## 3. Impact and Risk Analysis

- **System dependencies:** none beyond the dev toolchain. The game has no runtime dependency and no network access.
- **Determinism leaks.** The biggest risk to the replay criteria is a stray `Math.random()`, `Date.now()`, timer, or iteration over an object with insertion-order assumptions. Mitigation: ESLint `no-restricted-properties`, `no-restricted-syntax` and `no-restricted-globals` make the first three a lint failure outside `main.ts`; a dedicated test runs two games with the same seed for 3000 ticks (with `collisions: false`) and deep-equals their snapshots every 100 ticks.
- **Floating-point drift in distance and positions.** `distance` and `y` accumulate floats. Mitigation: the public `score` is floored; the two-games-same-seed test catches any non-determinism, and floats are deterministic for identical operation sequences.
- **Node version on student machines.** The toolchain needs Node 22.13 or newer (ESLint 10's floor; Vite needs 20.19 or 22.12); students on older Node get a confusing error. Mitigation: `engines` plus the workshop preflight script check the version before anything else.
- **Chromium download.** `playwright install chromium` is about 150 MB and fails on restricted networks. Mitigation: it runs only in `pree2e`, never in `npm install`; the README says so; `npm test` never needs a browser.
- **Hidden tab and clock jumps.** Without the 100 ms clamp a tab in the background would replay seconds of play on return and kill the dino. The clamp is in `frame()` and tested with synthetic `nowMs` sequences, including a backwards clock.
- **Fractional scale on small windows.** Below 800 CSS px the renderer's scale is fractional, so 1-logical-pixel edges can fall between device pixels and blend slightly; at full size everything stays on whole pixels. Accepted for small windows; a pixel-perfect alternative (integer scales only) would leave large margins.
- **Keyboard focus and lost key releases.** Listeners are on `window`, so the canvas needs no focus. A `keyup` that happens while the window is unfocused never arrives, so the adapter resets the reducer on `blur` and when the page is hidden. `preventDefault` is limited to Space and ArrowUp so the page stays accessible.
- **`localStorage` unavailable** (Safari private mode throws on write, some kiosks disable storage). Mitigation: the adapter degrades to memory; the game never throws on storage.
- **A failing cosmetic listener.** A bug in a feature listener must not freeze the game. Mitigation: the bus isolates listener errors and rethrows them asynchronously; `main.ts` re-arms `requestAnimationFrame` before running the frame.
- **Extension points for the next spec.** `background`, `parallax`, `foreground` layers, `setCamera`, the `RenderFrame` counter, and the `tick`, `land`, `die`, `milestone` events exist now even though nothing consumes them, so the next cycle adds visuals without touching `game.ts`. The feature-state rule in architecture 2.2 says where those visuals keep their own state.
- **Frozen contract pressure.** Once hidden tests exist, renaming anything in architecture section 3 breaks them. Mitigation: `CLAUDE.md` says so; the testing-expert checks the contract file in its coverage pass.

---

## 4. Testing Strategy

### 4.1 Layout

- `tests/<module>.test.ts` for each pure module, plus `tests/game.acceptance.test.ts` that drives `createGame` end to end against the functional spec's criteria, one `describe` per spec section.
- Test helpers in `tests/helpers.ts`: `makeGame(seed, overrides?)` with an in-memory store and a `randomSeed` stub that returns a scripted sequence; `runUntil(game, predicate, maxTicks)` that fails rather than loops when `maxTicks` is reached; `pressPrimary(game)`; `collect(game, eventType)`; `fakeContext()` that records `DrawContext` calls.
- `e2e/smoke.spec.ts`: the single Playwright test.

### 4.2 Criteria to tests (tick-level mapping)

The functional spec stays in user language; this table is the engineering translation. "Long run" means `collisions: false`.

| Spec | Test (file: assertion) |
|---|---|
| 2.1 start screen, HI shown or absent | acceptance: after `createGame`, `phase === 'idle'`, `obstacles.length === 0`, `score === 0`, `hud.hint === 'start'`; with store `load() → 123`, `hi === 123`; with `null`, `hi === null`; `randomSeed` not yet called. |
| 2.1 Space/Up starts, other keys do nothing | input: `keyDown('Space', false) → 'primary'`, `keyDown('ArrowUp', false) → 'primary'`, `keyDown('KeyA', false) → null`; acceptance: dispatch then `tick()` → `phase === 'running'`, `tick === 0`, hint `null`; after 60 more ticks `score > 0`. |
| 2.2 jump 0.6 s, no double jump, hold once | acceptance: ticks between `jump` and `land` events equals `JUMP_DURATION_TICKS ± 1`; a second `primary` while airborne produces no second `jump` event and an identical `y` trajectory to a control run; input: `keyDown` twice without `keyUp` → second returns `null`, `keyDown(…, true)` → `null`, after `reset()` the next `keyDown` returns `'primary'`. |
| 2.2 page does not scroll | e2e: a `keydown` listener added after `__dino` exists records `defaultPrevented === true` for Space. |
| 2.2 legs alternate | acceptance: while running on the ground `dino.frame` toggles every `RUN_FRAME_TICKS`; constant while airborne. |
| 2.3 first cactus 1.5 to 2.5 s | acceptance over seeds 0 to 199: the first tick at which an obstacle reaches the dinosaur (architecture section 3) is within `FIRST_ARRIVAL_TICKS`. |
| 2.3 both sizes within 20 s | acceptance, long run: for seeds 0 to 199 the `spawnLog` by tick 1200 contains both kinds. |
| 2.3 gap rule | obstacles: `nextGapPx(rngState, speed) ≥ speed * (JUMP_DURATION_TICKS + REACTION_TICKS)` for 10,000 samples at speeds 6, 9, 12; acceptance, long run: between consecutive groups (different `group`) the gap at spawn time meets the same bound. |
| 2.3 groups ≤ 3 and clearable | obstacles: `makeGroup` size ≤ `MAX_GROUP_SIZE`, contiguous, one shared `group`; acceptance: a `primary` dispatched when the group's leading edge is at the optimal distance (derived from jump height and duration) yields no `die`. |
| 2.3 removed off-screen | acceptance, long run: no obstacle with `x + width < 0` after any tick; ids strictly increasing within the run. |
| 2.4 pace | obstacles: `speedAt(1800) / START_SPEED` within 1.3 ± 0.05, `speedAt(5400) === MAX_SPEED`, `speedAt(7200) === MAX_SPEED`; acceptance, long run: `state.speed` at tick 1800 and 5400 matches; physics: airborne tick count equal at speed 6 and 12. |
| 2.5 crash on same tick, near miss | collision: overlapping drawn boxes with disjoint hitboxes → `false`; acceptance: run a seeded game without jumping until `die`; on that tick `phase === 'dead'`, `pose === 'hit'`, `hud.gameOver === true`, `hud.hint === 'restart'`, `hud.blinkVisible === true`; 600 further ticks change nothing and the bus emits no events. |
| 2.6 score rate, format, cap, blink | score: `advanceScore` over 60 ticks at `START_SPEED` ≈ 10 (±0.5), ≈ 20 at `MAX_SPEED`; `formatScore(42) === '00042'`, `formatScore(42.7) === '00042'`, `formatScore(123456) === '99999'`; acceptance, long run: `score` is always an integer, `blinkVisible` false on ticks 0 to 9, 20 to 29, 40 to 49 after `milestone`, true otherwise, and `milestone` fires with 100, then 200. |
| 2.6 HI update and persistence | acceptance: store spy `save` called once with the final score when it beats `hi ?? 0`, not called otherwise (including a zero-score run with `hi === null`); `die.highScore` equals `hi` after the death; e2e: after `die`, `page.reload()` shows `hi` equal to the recorded score. |
| 2.7 restart | acceptance: in `dead`, `primary` then `tick()` → `phase === 'running'`, `tick === 0`, `score === 0`, `obstacles` empty, `speed === START_SPEED`, one `restart` event and no `start`; first cactus again reaches the dinosaur within `FIRST_ARRIVAL_TICKS`; ten restarts with the same seed, long runs, produce snapshots at tick 300 deep-equal to the first run except `hi`; input reducer yields exactly one intent per `keyDown` after ten restarts. |
| 2.8 replay | acceptance: `makeGame(42)`, long run: run 600 ticks, restart, run 600 ticks → identical `spawnLog`; two games with seed 42 → deep-equal snapshots at ticks 100, 200, …, 3000; seed 42 vs 43 → different `spawnLog`; `seed: undefined` with `randomSeed` scripted `[1, 2]` → the two runs differ and `state.seed` reads 1 then 2; rng: `parseSeed('?seed=42') === 42`, `parseSeed('?seed=4294967295') === 4294967295`, and `'?seed=4294967296'`, `'?seed=abc'`, `'?seed=-5'`, `'?seed=4.2'`, `''` → `undefined`. |
| 2.5 red puddle (Change Log 2026-10-19) | puddle: no red while idle or running; after death red rows on whole pixels just above `GROUND_Y`, overlapping the dino hitbox; width grows monotonically over `PUDDLE.growFrames` frames then stays at `PUDDLE.width`; gone after restart and grows again after the next death; painted before the ground and dino; nothing after `dispose()`. |
| 2.9 layout, palette, hidden tab | e2e: canvas bounding box 800 by 300 at `x ≈ 240` in a 1280 viewport, `scrollWidth <= clientWidth`; in a 400-wide viewport the box is 368 by about 138 at `x ≈ 16`, backing store `round(368 · dpr)`, no horizontal scroll, phase and `hi` unchanged, then 800 by 300 again at 1280; render: `backingSize` for (800,1), (800,2), (368,1), (360,2), (343.5,3), (0,2); render: with `fakeContext()`, every `fillStyle` set by the built-in drawers is a `PALETTE` value; game: `frame()` with `nowMs` jumping by 10,000 runs exactly 6 steps, a backwards `nowMs` runs 0. |

### 4.3 The smoke test

Exactly the assertions in architecture section 5 (seven plus the small-window step), in that order, on `/?seed=42` against the production build, collecting `console.error` and `pageerror` for the whole test. Runtime target under 15 s.

### 4.4 Rules

- Every new test is proven RED first: the implementer reverts the covered change, runs that one test, watches it fail, restores, watches it pass.
- `npm test` must be green at the end of every task; `npm run check` green before the spec is verified.
- The `testing-expert` agent runs once after implementation, maps each criterion to the tests above, and records any uncovered criterion under Open Questions in `tasks.md`.
