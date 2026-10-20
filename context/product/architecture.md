# System Architecture Overview: Codeference Dino Runner

A single-page browser game with no backend. Everything below is chosen so that a learner can read the whole system in one sitting, every game rule can be tested without a browser, and new visual features can be added without touching the game loop.

Codebase exploration at creation time found no existing code, so every choice comes from the product definition, the functional spec and stated constraints. Items marked _(assumption)_ were not explicitly requested and can be changed. Section 3 is a frozen contract: names in it are relied on by tests outside this repository. This document records decisions; exact configuration (compiler flags, lint rule options, test runner settings) is owned by the technical considerations of spec 001.

---

## 1. Application & Technology Stack

- **Language:** TypeScript 5.x with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` and `moduleResolution: Bundler`. Relative imports carry the `.js` suffix. _Alternative: plain JavaScript._ Types are teaching material: the event bus is a discriminated union, so anyone adding a feature is told by the compiler which events exist.
- **Two type-check programs.** `tsconfig.json` covers `src/` with DOM and `vite/client` types and no Node types, so `process` and Node timers do not type-check in game code. `tsconfig.node.json` covers the config files, `tests/` and `e2e/` with Node types (an explicit `@types/node` dev dependency) plus DOM types, because tests import `src/` types.
- **Runtime:** modern evergreen desktop browsers (Chrome, Firefox, Safari, Edge, current and previous major). No polyfills.
- **Node:** 22 LTS, `engines.node >= 22.13` and an `.nvmrc`. Tooling only; the game has no Node dependency. (Current Vite requires 20.19+ or 22.12+ and ESLint 10 requires 22.13+, so 22.13 is the one floor that satisfies the whole toolchain.)
- **Build tool and dev server:** Vite, latest stable at implementation time, pinned in `package.json`. _Alternatives: esbuild directly, Parcel._
- **Rendering:** HTML5 Canvas 2D API, one `<canvas>`, no rendering library. _Alternatives: PixiJS, Phaser._ An engine would hide exactly the parts learners are meant to see.
- **Package manager and scripts:** npm with a committed `package-lock.json`. npm scripts are the only task runner:
  - `npm install`: dependencies only. No `postinstall` download, so a restricted network never breaks install.
  - `npm run dev`: Vite dev server on port 5173.
  - `npm test`: both type-check programs, then `vitest run`.
  - `npm run e2e`: Playwright smoke test against the production build; a `pree2e` script runs `npm run e2e:install` (`playwright install chromium`), which is a no-op once installed.
  - `npm run lint`: ESLint and Prettier check. `npm run build`: `vite build` to `dist/`. `npm run check`: lint, test, e2e. CI runs exactly `npm run check`.
- **Dependencies at runtime:** none. All packages are dev dependencies.

---

## 2. Code Structure & Design Principles

### 2.1 Module layout (`src/`)

| Module | Responsibility | DOM allowed |
|---|---|---|
| `main.ts` | Bootstrap: parse the URL, create the store, bus, renderer, keyboard and game; own the `requestAnimationFrame` frame driver; size the canvas backing store to its displayed size times `devicePixelRatio`, re-fitting it when the element is resized or the pixel ratio changes; install the `window.__dino` test hook. The only permitted `Math.random()` call lives here (the per-run random seed). | yes |
| `game.ts` | `createGame(deps)`: the state machine (`idle → running → dead → running …`), the fixed step, the intent queue, run reset, HUD state derivation, event emission. Holds a private `RunState` and projects it onto the public `GameState`. | no |
| `events.ts` | Typed event bus: the `GameEvent` union, `createBus()` with `on` (returns unsubscribe), `off`, `emit`. | no |
| `physics.ts` | Gravity, jump impulse, ground contact. Pure functions over plain data. | no |
| `obstacles.ts` | Cactus spawning, gap selection, speed ramp. Pure; takes the current tick, speed and `Rng`. | no |
| `collision.ts` | Axis-aligned hitbox intersection using the per-sprite hitboxes from `sprites.ts`. | no |
| `score.ts` | `advanceScore`, `isMilestone`, `formatScore` (floored, five digits, zero-padded, capped at 99999). Pure. | no |
| `sprites.ts` | Pure data: each sprite as a `readonly string[]` bitmap (`#` = pixel) plus its hitbox. Three dino poses (two run frames, hit), two cactus sizes, ground tile. Width and height derive from the bitmap. No binary assets in the repository. | no |
| `tuning.ts` | Every number the spec quotes and every layout number, as named `as const` exports: `STEP_SECONDS`, `CANVAS`, `PALETTE`, `GROUND_Y`, `DINO_X`, `START_SPEED`, `MAX_SPEED`, `MAX_SPEED_AT_TICK`, `JUMP_DURATION_TICKS`, `JUMP_HEIGHT_PX`, `FIRST_ARRIVAL_TICKS`, `REACTION_TICKS`, `MAX_GROUP_SIZE`, `SCORE_PER_SECOND`, `MAX_SCORE`, `MILESTONE_EVERY`, `RUN_FRAME_TICKS`, `BLINK_SCHEDULE`, `FRAME_CLAMP_MS`, `MAX_SEED`. The export names are part of the frozen contract; the values may be retuned. | no |
| `rng.ts` | `createRng(seed)` (mulberry32) behind `Rng { next(): number }` returning [0, 1); `parseSeed(search)`. | no |
| `render.ts` | `createRenderer(canvas)`: draws sprites with `fillRect` from precomputed pixel runs (no offscreen canvases), derives its scale from `canvas.width / CANVAS.width`, applies the camera offset, runs layer callbacks, counts render frames. Reads state, never mutates it. | yes |
| `input.ts` | The pure keyboard reducer `createKeyboard()`. | no |
| `input-dom.ts` | The DOM adapter `attachKeyboard(window, keyboard, onIntent)` with `dispose()`. | yes |
| `features/` | Cosmetic features, one module each, installed from `main.ts` as `installX({ game, renderer })` and following the "Features own their state" rule in 2.2. First: `puddle.ts`, the red pool on the game-over screen. | no |
| `store.ts` | High-score stores behind `HighScoreStore`: `createMemoryStore()` and `createStorageStore(storage, key)` over any `getItem`/`setItem` storage (`main.ts` passes `localStorage`). Rejects stored values that are not a score the game can produce and never lowers the stored best. | no |
| `assert.ts` | `assertNever`, shared by every `switch` on a union. | no |
| `types.ts` | Shapes shared by several modules: `Rect`, `Dino`, `Obstacle`, `DinoPose`, `ObstacleKind`, `Phase`, `GameState`, `GameDeps`, `Game`, `Intent`, `Rng`, `HighScoreStore`, `LayerName`, `DrawContext`, `RenderFrame`, `LayerDraw`. Module-private types stay in their module. | no |

### 2.2 Rules

- **Pure logic has no DOM access.** Only `main.ts`, `render.ts` and `input-dom.ts` may reference `window`, `document`, `localStorage`, `performance`, `requestAnimationFrame`, timers or the canvas. Every other module is plain TypeScript over plain objects and runs in Node under Vitest. Enforced by ESLint `no-restricted-globals` on every file outside that allow-list, not by convention.
- **Deterministic by construction.** All randomness in the simulation goes through the game's `Rng`; all simulation time is the tick counter. `Math.random`, `Date.now`, `new Date`, `performance.now`, `setTimeout` and `setInterval` appear under `src/` only in `main.ts`, enforced by ESLint `no-restricted-properties` and `no-restricted-syntax` with an allow-list of `main.ts` alone. Any visual that depends on simulation time (run-cycle frame, milestone blink) derives it from `state.tick`.
- **Gameplay emits, features subscribe.** Cross-cutting behaviour goes through the bus. A step collects its events; `game.ts` commits the new state and then emits them synchronously in step order, before that frame's render, so a listener calling `game.state()` sees the post-step state. Listeners may call `dispatch` (queued for the next step); calling `tick` or `frame` from a listener throws. A throwing listener stops neither the other listeners nor the step: the bus reports the error asynchronously with `queueMicrotask`, so it surfaces as an uncaught error without breaking the frame loop. `speedChange` fires only when speed crosses a 0.1x multiple of `START_SPEED`, not every tick.
- **Features own their state.** A cosmetic feature is a module exporting `installX({ game, renderer })` that returns `dispose()`. It keeps its own state in a closure, resets it on `start` and `restart`, updates it from events, and draws it from a layer callback. It never writes to `GameState`, never edits `game.ts`, and never keeps module-level state that would survive a restart. Changes driven by the simulation (dust on `land`) follow the `tick` event; animations that must keep moving on the frozen game-over screen use the `RenderFrame` counter passed to draw callbacks. Visual randomness uses the feature's own `createRng(state.seed ^ SALT)` and never advances the game's `Rng`, so a feature cannot change the course.
- **Draw in layers.** `renderer.addLayer(layer, draw)` with `draw(ctx: DrawContext, state: GameState, frame: RenderFrame)` returns an unsubscribe. Layers run in the fixed order `background`, `parallax`, `world`, `foreground`, `hud`, and within a layer in registration order. Each callback is wrapped in `ctx.save()` / `ctx.restore()`. All drawing uses logical 800 by 300 coordinates. `parallax`, `world` and `foreground` are translated by the camera offset from `renderer.setCamera(fn)` (zero by default; screen shake uses it); `background` and `hud` never move. The built-in ground, cacti, dino and HUD drawers register through this same API so that a learner has a visible example to copy. Draw callbacks receive no `emit`.
- **Seed lifecycle.** `main.ts` parses `seed` from the query string; `parseSeed` accepts a whole number from 0 to `MAX_SEED` (2^32 − 1) and treats anything else as absent, because mulberry32 would map larger values onto smaller ones. A run's seed is the URL seed if present, otherwise `deps.randomSeed()`, called exactly once per start and per restart and never at construction. A fresh `Rng` is built from it, so a seeded page replays the same course and an unseeded page does not. The `Rng` state is a plain `uint32` inside `RunState` and is never advanced outside a step.
- **Fixed timestep and frame driver.** The simulation advances in steps of `STEP_SECONDS = 1/60`; `game.tick(n)` advances exactly n steps and takes no time argument. `game.frame(nowMs)` is the accumulator used by the browser: the first call only records `nowMs` and returns 0; later calls add the elapsed time clamped to [0, `FRAME_CLAMP_MS`], run whole steps (compared with a small epsilon, so a clamped 100 ms frame runs exactly 6 steps), carry the remainder, and return how many steps ran, including steps in `idle` or `dead` where nothing moves. `main.ts` re-arms `requestAnimationFrame` first, then calls `game.frame(performance.now())` and renders exactly once from `game.view()`. No interpolation; duplicate frames on high-refresh displays are accepted.
- **Input model.** The keyboard reducer tracks held keys per key code. `keyDown(code, repeat)` returns `primary` only for `Space` or `ArrowUp`, with `repeat === false`, when that code is not already held; `keyUp(code)` releases it; `reset()` releases all. The DOM adapter registers `keydown` and `keyup` once, calls `preventDefault()` on every `keydown` and `keyup` of those two keys whatever the reducer returns, calls `reset()` on window `blur` and when the document becomes hidden (a `keyup` during alt-tab is never delivered), and exposes `dispose()`. Intents are queued; the next step consumes at most one `primary` and drops the rest, interpreting it by phase: `idle` starts the run, `running` and grounded jumps, `running` and airborne is ignored, `dead` restarts.
- **Start and restart.** The step that consumes `primary` in `idle` or `dead` builds a fresh run from `tuning.ts` initial values (seed and `Rng`, speed, spawn position, obstacles and the obstacle id counter, score, dino, HUD), emits `start` or `restart`, and moves nothing: `tick` is 0 after it. The next step is running tick 1. Only the persisted high score survives.
- **HUD is state, not rendering logic.** `game.ts` derives `hud.hint` (a key, not text), `hud.gameOver`, `hud.blinkVisible`, `dino.pose` and `dino.frame` (toggles every `RUN_FRAME_TICKS` while running on the ground). `blinkVisible` follows `BLINK_SCHEDULE` while running (hidden on ticks 0 to 9, 20 to 29 and 40 to 49 after a milestone) and is always `true` outside `running`, so the final score is never hidden on the game-over screen. `render.ts` maps hint keys to text and paints the fields verbatim; it decides nothing.
- **State conventions.** `game.ts` keeps a private `RunState` (the `Rng` state, the exact float distance behind the score, the next spawn position, the blink start, the next obstacle id, the intent queue) separate from the public `GameState`. `step(runState, intent)` is pure and returns `{ runState, events }`; `state()` is a `structuredClone` of the projection, so snapshot tests are plain equality. `phase` is a literal union; every `switch` on it ends in `assertNever`. `Rng` and `HighScoreStore` are interfaces without an `I` prefix; implementations are `createX()` factories. Constants are `as const` objects with derived unions, never `enum`.

---

## 3. Testing Contract (frozen)

These names are a public contract. Tests outside this repository import them, so feature work may add to them but must not rename or remove them. Mirrored in `CLAUDE.md`.

```ts
// types.ts
type Intent = 'primary';
type Phase = 'idle' | 'running' | 'dead';
type DinoPose = 'stand' | 'run' | 'hit';
type ObstacleKind = 'small' | 'large';
type LayerName = 'background' | 'parallax' | 'world' | 'foreground' | 'hud';

// Logical canvas pixels: origin top-left, y grows downward, (x, y) is the top-left corner.
interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

interface Dino extends Rect {
  readonly onGround: boolean;
  readonly pose: DinoPose;            // 'hit' only when phase === 'dead'
  readonly frame: 0 | 1;              // run-cycle frame
  readonly hitbox: Rect;              // absolute; what collision uses
}

interface Obstacle extends Rect {
  readonly id: number;                // 0, 1, 2 … within a run; resets on start and restart
  readonly group: number;             // 0, 1, 2 … within a run; obstacles of one group share it
  readonly kind: ObstacleKind;
  readonly hitbox: Rect;
}

interface GameDeps {
  seed?: number | undefined;          // from the URL; undefined means a random seed per run
  randomSeed: () => number;           // main.ts: Math.random based; tests: a stub
  store: HighScoreStore;              // main.ts: localStorage adapter; tests: in-memory
  bus?: EventBus | undefined;         // createGame makes one if absent
  collisions?: boolean | undefined;   // default true; false only in tests, to keep a run alive
}

interface GameState {
  readonly phase: Phase;
  readonly tick: number;              // running steps in this run; 0 in idle and right after (re)start
  readonly seed: number | null;       // this run's seed; null before the first run of an unseeded page
  readonly speed: number;             // px per step
  readonly scrollX: number;           // px the world has moved this run (sum of per-step speeds); 0 in idle and after (re)start
  readonly score: number;             // whole points, floored, capped at MAX_SCORE
  readonly hi: number | null;         // null when no high score has ever been recorded
  readonly dino: Dino;
  readonly obstacles: readonly Obstacle[];
  readonly spawnLog: readonly { readonly kind: ObstacleKind; readonly group: number; readonly tick: number }[];
                                      // one entry per obstacle, this run only
  readonly hud: { readonly hint: 'start' | 'restart' | null; readonly gameOver: boolean; readonly blinkVisible: boolean };
}

interface Game {
  tick(n?: number): void;             // advance exactly n steps (default 1)
  frame(nowMs: number): number;       // browser accumulator; returns steps run
  dispatch(intent: Intent): void;     // queued, applied at the next step
  state(): GameState;                 // plain, JSON-serialisable deep copy
  view(): GameState;                  // live projection for the renderer; do not keep across steps
  on: EventSource['on'];
}

type GameEvent =
  | { type: 'start'; seed: number }
  | { type: 'tick'; tick: number }
  | { type: 'jump' }
  | { type: 'land' }
  | { type: 'spawn'; obstacle: Obstacle }
  | { type: 'milestone'; score: number }
  | { type: 'speedChange'; speed: number }
  | { type: 'die'; score: number; highScore: number; isNewHighScore: boolean }
  | { type: 'restart'; seed: number };

interface EventSource {
  on<K extends GameEvent['type']>(type: K, handler: (e: Extract<GameEvent, { type: K }>) => void): () => void;
  off<K extends GameEvent['type']>(type: K, handler: (e: Extract<GameEvent, { type: K }>) => void): void;
}
interface EventBus extends EventSource { emit(event: GameEvent): void }

interface HighScoreStore { load(): number | null; save(score: number): void }
interface Rng { next(): number }      // [0, 1)

type DrawContext = Pick<CanvasRenderingContext2D,
  'fillStyle' | 'font' | 'textAlign' | 'textBaseline' | 'globalAlpha' |
  'fillRect' | 'fillText' | 'translate' | 'save' | 'restore'>;
interface RenderFrame { readonly count: number }   // render frames since page load; visuals only
type LayerDraw = (ctx: DrawContext, state: GameState, frame: RenderFrame) => void;
```

- **Functions.** `createGame(deps: GameDeps): Game` in `game.ts`. `createKeyboard()` in `input.ts` with `keyDown(code: string, repeat: boolean): Intent | null`, `keyUp(code: string): void` and `reset(): void`. `createRng(seed: number): Rng` and `parseSeed(search: string): number | undefined` (0 to `MAX_SEED`) in `rng.ts`. `formatScore(n: number): string` in `score.ts` (floors, pads to five digits, caps at `99999`). `createRenderer(canvas)` in `render.ts` returning `addLayer(layer: LayerName, draw: LayerDraw): () => void`, `setCamera(fn: (state: GameState, frame: RenderFrame) => { x: number; y: number }): void` and `draw(state: GameState): void`. The `tuning.ts` export names listed in section 2.1.
- **Step semantics.** The step that applies a start or restart leaves `tick === 0` and moves nothing; each later running step increments `tick` first. A step consumes at most one `primary`. `frame` semantics are as in section 2.2.
- **Event semantics.** Within a step, events are emitted in this order: `speedChange`, `jump`, `land`, `spawn`, `milestone`, `die`, `tick`.

  | Event | When | Payload |
  |---|---|---|
  | `start` | the first run from `idle` only | the run's seed |
  | `restart` | a run from `dead`; never also `start` | the run's seed |
  | `tick` | once per running step, last, including the step that dies; never in `idle` or `dead` | the new `tick` |
  | `spawn` | once per obstacle, in group order | the obstacle |
  | `milestone` | the score crosses a multiple of `MILESTONE_EVERY` | that multiple |
  | `speedChange` | `floor(speed / START_SPEED * 10)` changes | the new speed |
  | `die` | collision | `score`: the final score; `highScore`: `hi` after the death; `isNewHighScore`: whether it was saved |

- **High score rule.** A run's score is saved when `score > (hi ?? 0)`. A zero-score run with no recorded best saves nothing, so no `HI` appears.
- **Reaching the dinosaur.** An obstacle reaches the dinosaur on the first tick where `obstacle.hitbox.x <= dino.hitbox.x + dino.hitbox.width`.
- **Growth.** The output unions (`Phase`, `DinoPose`, `ObstacleKind`, `LayerName`, `Intent`, the `GameEvent` types) may gain members. Code outside this repository must not switch on them exhaustively.
- **Browser surface.** `main.ts` always sets a frozen `window.__dino = { state: () => game.state(), seed: number | undefined, version: number }`, declared in `src/global.d.ts`. `seed` is the URL seed; the current run's seed is `state().seed`. `version` starts at 1 and only increases. The canvas is `canvas#game`, and the high score lives in `localStorage` under `dino.hi`. These are the only DOM-visible surfaces the Playwright tests use, and they carry no telemetry. Feature work may add fields, never remove or rename them.

---

## 4. Data & Persistence

- **High score:** one `localStorage` key, `dino.hi`, holding a decimal integer string. The adapter `createLocalStorageStore()` lives in `main.ts`, wraps every access in `try/catch`, and falls back to `createMemoryStore()` when storage is unavailable (private windows, disabled storage). Absent, non-numeric or negative values read as `null`. Read once at startup into `state.hi`; written on `die` by the high score rule in section 3. `score.ts` and `game.ts` never see `localStorage`, only the `HighScoreStore` interface.
- **Game state:** in memory only, a single `RunState` owned by `game.ts`.
- **No database, no network calls, no cookies, no analytics.**

---

## 5. Testing & Quality

- **Unit tests:** Vitest in the Node environment, `tests/<module>.test.ts` mirroring `src/`, configured in `vite.config.ts`. Acceptance-level tests drive `createGame` with a stubbed `randomSeed`, an in-memory store and `tick(n)`, and assert on `state()` and emitted events; tests that need a run longer than the first cactus pass `collisions: false`. Rendering is tested by passing a recording fake `DrawContext` to the layer callbacks. Every acceptance criterion in the functional spec except page load, scroll prevention, persistence across reloads and page layout is proven here. The technical considerations of each spec map criteria to tests, in ticks and state fields; the functional spec stays in user language.
- **End-to-end:** Playwright, Chromium only, against the production build served by `vite preview` on a dedicated port with `strictPort`, never reusing a running server. One smoke test, which proves only the wiring unit tests cannot: no console or page errors; the canvas is 800 by 300 and centred with no horizontal scroll; `__dino.seed === 42` on `/?seed=42` and the phase is `idle`; pressing Space starts the run and a `keydown` listener added after bootstrap sees `defaultPrevented`; the score grows within one second of real time; without input the phase becomes `dead` within four seconds; after `page.reload()` the recorded score is shown as `hi`; in a 400-pixel-wide window the canvas shrinks to fit without horizontal scroll or a restart, and returns to 800 by 300 at 1280. No screenshot comparison.
- **Type checking as a test:** `npm test` runs both type-check programs first.
- **Lint and format:** ESLint flat config with `typescript-eslint` `strictTypeChecked` and `stylisticTypeChecked`; `consistent-type-assertions` set to `never` (no `as` casts; `as const` stays allowed); `ban-ts-comment`; `consistent-type-imports`; the DOM and determinism restrictions from section 2.2. JavaScript config files are linted without type information. Prettier defaults with `eslint-config-prettier` last. Lint failures fail `npm run lint`. _(assumption)_
- **Coverage:** `@vitest/coverage-v8`, reported in CI only, not enforced. _(assumption)_

---

## 6. Infrastructure & Deployment

- **Hosting:** none required. `npm run build` produces a static `dist/`.
- **Continuous integration:** one GitHub Actions job on push and pull request, Node 22: `npm ci && npm run check`. _(assumption)_
- **Preview hosting:** GitHub Pages from `dist/` on `main` if a public demo is wanted; `vite.config.ts` sets `base` from an environment variable. Off by default. _(assumption)_
- **Environments:** one.

---

## 7. External Services & APIs

- **None.** No authentication, payments, third-party APIs, CDN fonts or remote assets. Sprites are procedural bitmaps in `sprites.ts`, so bootstrap is synchronous and the smoke test never waits for image loads.

---

## 8. Rendering Details & Observability

- **Canvas sizing:** CSS shows the game area at 800 by 300, centred, and shrinks it to fit smaller windows with a 16 px margin, keeping its 8:3 shape; it never grows beyond 800 by 300. `main.ts` (`fitCanvas`) keeps the backing store at the displayed size times `devicePixelRatio` (pure helper `backingSize` in `render.ts`), re-fitting on a `ResizeObserver` and on pixel-ratio changes. Each frame, `render.ts` derives the scale from `canvas.width / CANVAS.width`, then sets the transform, disables image smoothing and clears to `PALETTE.bg`, in that order, because resizing the canvas resets the first two. The canvas has CSS `image-rendering: pixelated`. At full size every logical pixel lands on whole device pixels; below 800 px the scale is fractional and 1-pixel edges may blend slightly. HUD text is right-aligned to a fixed edge, so font metrics that differ by operating system do not move it.
- **Runtime observability:** browser console only. The game logs nothing in normal play; uncaught errors fail the smoke test. No telemetry.
- **Performance target:** 60 steps per second on a laptop; the fixed timestep keeps rules correct when rendering drops frames. The renderer reads `game.view()`, so a frame allocates no copy of the state.

---

## 9. Development Environment & AI Tooling

- **Editor and agents:** Claude Code with the AWOS workflow installed in this repository (`.awos/`, `.claude/commands/awos/`). Specifications live under `context/spec/`. No specialist agents ship with the repository: `/awos:hire` adds them under `.claude/agents/` and records coverage in `context/product/hired-agents.md`.
- **Project conventions for agents:** `CLAUDE.md` at the repository root: the npm scripts, the rules in section 2.2, the frozen contract in section 3, and the test layout.
- **Workshop activity log:** when the repository is prepared for the workshop, Claude Code hooks under `.claude/hooks/` append agent-session activity to `.workshop/activity.jsonl` (prompts truncated and with secret-like strings redacted, tool names, file paths, timestamps; never file contents or model output), and a `PreToolUse` hook plus a git pre-commit hook block secrets from being committed. The log describes the development session, not the player, so the game itself still has no telemetry (sections 4 and 8). It is used for judging and is explained to participants before the first exercise, with what it records and who reads it.
