# Tasks: Core Game

- **Functional Specification:** [functional-spec.md](./functional-spec.md)
- **Technical Considerations:** [technical-considerations.md](./technical-considerations.md)
- **Architecture and frozen contract:** [architecture.md](../../product/architecture.md), section 3

Ten slices: nine that each add something a player can see, then Feature Testing & Regression. Every slice leaves the game runnable with `npm run dev` and `npm run check` green. Each implementation task includes its own unit tests from the criteria table in technical considerations 4.2, proven RED first (CLAUDE.md). Visual checks in Verify tasks use a throwaway Playwright script against `npm run preview`; the script, its screenshots and the server are removed at the end of the same task.

Tasks marked _(parallel: wave N.X)_ may run at the same time as the other tasks of the same wave, as separate subagents; everything else runs one at a time in document order. See the Parallelization Plan below for the waves, the files each task owns, and the rules that keep parallel tasks from conflicting.

---

## Parallelization Plan

**Why so little crosses slice boundaries.** Every slice changes `src/game.ts` (the step function), so slices run strictly in order; parallelism exists only inside a slice, between tasks that write different files. Verify tasks and the smoke test use port 4173 with `strictPort`, so they never run in parallel.

**Rules for a parallel wave.**

1. A task writes only the files listed for it in the table below. The shared files `package.json`, `package-lock.json`, the config files, `src/types.ts`, `src/tuning.ts`, `src/game.ts`, `src/main.ts`, `tests/helpers.ts` and `e2e/smoke.spec.ts` are never written by a parallel task unless the table assigns that file to exactly one task of the wave.
2. A task's tests import only its own module plus `types.ts`, `tuning.ts` and modules finished in earlier waves, never a module a sibling task is still writing. Renderer tests build `GameState` fixtures by hand instead of calling `createGame`.
3. While a wave runs, each task iterates and proves RED on its own test file only (`npx vitest run tests/<module>.test.ts`) and lints only its own files. RED validation reverts only that task's own files.
4. **Join.** When every task of a wave is done, and before anything after it starts, the orchestrator running `/awos:implement` runs `npm run typecheck && npm test` once. This is a read-only check, not implementation work. If it fails, the wave's tasks are reopened (`[x]` back to `[ ]`) and fixed before anything else proceeds.
5. No parallel task adds or upgrades a dependency. A task that finds it needs one stops and reports it.

| Wave | Tasks in parallel | Files each task owns | Starts after | Followed by |
|---|---|---|---|---|
| 1.B | 1.3, 1.4, 1.5 | 1.3: `src/sprites.ts`, `tests/sprites.test.ts` · 1.4: `src/events.ts`, `tests/events.test.ts` · 1.5: `src/score.ts`, `tests/score.test.ts` | task 1.2 | join, then wave 1.C |
| 1.C | 1.6, 1.7 | 1.6: `src/game.ts`, `tests/game.acceptance.test.ts`, `tests/helpers.ts` · 1.7: `src/render.ts`, `tests/render.test.ts` | join of wave 1.B | join, then 1.8 |
| 2.A | 2.1, 2.2, 2.3 | 2.1: `src/input.ts`, `src/input-dom.ts`, `src/main.ts`, `tests/input.test.ts` · 2.2: `src/game.ts`, `src/score.ts`, `tests/game.acceptance.test.ts`, `tests/score.test.ts`, `tests/helpers.ts` · 2.3: `src/sprites.ts`, `src/render.ts`, `tests/sprites.test.ts`, `tests/render.test.ts` | slice 1 | join, then 2.4 |
| 4.A | 4.1, 4.2 | 4.1: `src/rng.ts`, `tests/rng.test.ts` · 4.2: `src/sprites.ts`, `src/render.ts`, `tests/sprites.test.ts`, `tests/render.test.ts` | slice 3 | join, then 4.3 |
| 5.A | 5.1, 5.2 | 5.1: `src/collision.ts`, `tests/collision.test.ts` · 5.2: `src/sprites.ts`, `src/render.ts`, `tests/sprites.test.ts`, `tests/render.test.ts` | slice 4 | join, then 5.3 |
| 8.A | 8.1, 8.2 | 8.1: `src/score.ts`, `tests/score.test.ts` · 8.2: `src/render.ts`, `src/tuning.ts`, `tests/render.test.ts` | slice 7 | join, then 8.3 |
| 9.A | 9.1, 9.2 | 9.1: `src/rng.ts`, `tests/rng.test.ts` · 9.2: `src/game.ts`, `tests/game.acceptance.test.ts`, `tests/helpers.ts` | slice 8 | join, then 9.3 |

Sequential: 1.1, 1.2, 1.8, 1.9, 2.4, 2.5, all of slices 3, 6, 7 and 10, and every Verify task. No two tasks in the same wave share a source or test file, so no subagent can overwrite another's work. Running the waves turns 40 tasks into 31 sequential steps; the saving is modest because every slice funnels through `game.ts`.

**How to run it.** `/awos:implement` picks tasks one at a time in document order. To use the waves, when it reaches the first task of a wave, launch every task of that wave as separate subagents in one message, wait for all of them, mark each `[x]`, run the join check, then continue in document order.

---

- [x] **Slice 1: The start screen loads in the browser**

  > Opening the page shows the dinosaur standing on the ground, the score `00000` and the hint "Press SPACE to start", centred in an 800 by 300 game area. Nothing moves yet.
  - [x] **1.1** Scaffold the project exactly as technical considerations 2.1: `package.json` (scripts, pinned dev dependencies including `@types/node`), `.nvmrc`, `tsconfig.json` and `tsconfig.node.json`, `vite.config.ts`, `playwright.config.ts`, `eslint.config.js` with the DOM and determinism restrictions, `.prettierrc`, `index.html` with `canvas#game`, `src/style.css`, `src/global.d.ts`, `.github/workflows/check.yml`. Run `npm install` and keep the generated `package-lock.json` in the repository. **[Agent: typescript-canvas-frontend]**
  - [x] **1.2** Add `src/tuning.ts` with every constant in technical considerations 2.3 under its frozen name, and `src/types.ts` with all section 3 contract types (`Rect`, `Dino`, `Obstacle`, `GameState`, `GameDeps`, `Game`, `GameEvent`, `EventSource`, `EventBus`, `HighScoreStore`, `Rng`, `LayerName`, `DrawContext`, `RenderFrame`, `LayerDraw`) plus the `DinoHook` type for `global.d.ts`. Later tasks read these two files and do not change them without a sequential task of their own. **[Agent: typescript-canvas-frontend]**
  - [x] **1.3** Add `src/sprites.ts` with the ASCII bitmaps, hitboxes and precomputed `runs` for `dinoStand` and `ground` (the other sprites come with later slices); test that width and height derive from the bitmap and that `runs` cover exactly the `#` pixels. _(parallel: wave 1.B)_ **[Agent: typescript-canvas-frontend]**
  - [x] **1.4** Add `src/events.ts`: `createBus` with a `Set` per event type, `emit` iterating a copy, and throwing handlers isolated and rethrown via `queueMicrotask`. Test unsubscribe during emit, duplicate registration, and that a throwing handler does not stop the others. _(parallel: wave 1.B)_ **[Agent: typescript-canvas-frontend]**
  - [x] **1.5** Add `src/score.ts` with `formatScore` (floors, pads to five digits, caps at `99999`) and its tests. _(parallel: wave 1.B)_ **[Agent: typescript-canvas-frontend]**
  - [x] **1.6** Add a minimal `src/game.ts`: `createGame(deps)` returning an `idle` state (`tick 0`, `score 0`, `seed null` when no seed is given, `hi` from `store.load()`, `hint 'start'`, `blinkVisible true`, dino standing at `DINO_X` on `GROUND_Y` sized from `dinoStand`), `state()` as `structuredClone`, `view()`, `on` backed by `deps.bus ?? createBus()`, and `tick`/`dispatch` as no-ops in `idle`. Add `tests/helpers.ts` (`makeGame`, `runUntil` that fails at `maxTicks`, `pressPrimary`, `collect`, an in-memory store with a `save` spy) and the 2.1 start-screen row, including that `randomSeed` is not called at construction. _(parallel: wave 1.C)_ **[Agent: typescript-canvas-frontend]**
  - [x] **1.7** Add `src/render.ts`: `createRenderer(canvas)` with `addLayer`, `setCamera`, `draw`, `dispose`, the frame preamble (scale from `canvas.width / CANVAS.width`, transform, smoothing off, clear), layer order with save/restore, camera translation around `parallax`, `world`, `foreground`, the `RenderFrame` counter, and the built-in `world` (ground, dino) and `hud` (score, hint) drawers using `fillRect` over sprite runs. Test with a recording fake `DrawContext` and hand-built `GameState` fixtures: layer order, every `fillStyle` is a `PALETTE` value, hint text drawn for `hint 'start'`. _(parallel: wave 1.C)_ **[Agent: typescript-canvas-frontend]**
  - [x] **1.8** Add `src/main.ts` per technical considerations 2.6, except the keyboard (slice 2) and `parseSeed` (slice 9): pass no `seed`, define `randomSeed` with `Math.random`, canvas lookup with an `instanceof` guard, DPR sizing and change listener, `createLocalStorageStore` with memory fallback, the frozen `window.__dino` hook, and the rAF loop re-armed first. Add the first part of `e2e/smoke.spec.ts`: no console or page errors, the canvas is 800 by 300 and centred with no horizontal scroll, the phase is `idle`. **[Agent: typescript-canvas-frontend]**
  - [x] **1.9** Verify: run `npm run check` and confirm lint, both type checks, unit tests and the smoke test pass. Build, start `npm run preview` in the background recording its PID, open `/` at 1280 by 800 with a throwaway Playwright script, screenshot the canvas and confirm the standing dinosaur, the ground line, `00000` top right and the start hint in dark grey on near-white. Delete the script and screenshots and stop the server by its PID. **[Agent: typescript-canvas-frontend]**

- [x] **Slice 2: Press SPACE and the dinosaur runs**

  > SPACE or UP starts the run: the hint disappears, the legs alternate, the ground scrolls and the score counts up. Other keys do nothing. No obstacles yet.
  - [x] **2.1** Add `src/input.ts` (`createKeyboard`: per-code held `Set`, `keyDown`, `keyUp`, `reset`) and `src/input-dom.ts` (`attachKeyboard` with `preventDefault` on every Space and ArrowUp `keydown`/`keyup`, `reset` on `blur` and when hidden, `dispose`), and wire `attachKeyboard(window, keyboard, intent => { game.dispatch(intent); })` into `src/main.ts`. Test the input rows of 2.1, 2.2 and 2.7. _(parallel: wave 2.A)_ **[Agent: typescript-canvas-frontend]**
  - [x] **2.2** Extend `src/game.ts` with the intent queue (at most one `primary` per step), the start step from technical considerations 2.4 step 1 (seed from one `randomSeed()` call, `tick 0`, `START_SPEED`, emits `start`, moves nothing), running steps 2, 3, 8, 10 and 11 at constant `START_SPEED`, `distance` and floored `score` via a new `advanceScore` in `src/score.ts`, `dino.pose 'run'` and `dino.frame` toggling every `RUN_FRAME_TICKS`, the `tick` event, the re-entrancy guard, and `frame(nowMs)` with the first-call, clamp and epsilon rules. Test the 2.1 start row, the 2.2 legs row, the score rate at `START_SPEED`, and `frame` (a 10,000 ms gap runs 6 steps, a backwards clock runs 0). _(parallel: wave 2.A)_ **[Agent: typescript-canvas-frontend]**
  - [x] **2.3** Add the `dinoRun0` and `dinoRun1` sprites; the `world` drawer picks the sprite from `pose` and `frame` and scrolls ground tiles by `tick * speed`. Test the sprite choice and the ground offset with fixtures. _(parallel: wave 2.A)_ **[Agent: typescript-canvas-frontend]**
  - [x] **2.4** Extend the smoke test: pressing Space starts the run, a `keydown` listener added after `__dino` exists sees `defaultPrevented`, and the score grows within one second. **[Agent: typescript-canvas-frontend]**
  - [x] **2.5** Verify: run `npm run check`. Start `npm run preview` in the background recording its PID; with a throwaway Playwright script press `KeyA` (phase stays `idle`), then Space, and screenshot twice a few frames apart to confirm the hint is gone, the legs alternate and the score rises. Delete the script and screenshots and stop the server by its PID. **[Agent: typescript-canvas-frontend]**

- [x] **Slice 3: The dinosaur jumps**

  > SPACE or UP on the ground makes the dinosaur jump and land about 0.6 s later; presses in the air and held keys do nothing extra; the page never scrolls.
  - [x] **3.1** Add `src/physics.ts` (`startJump`, `applyGravity`, `isOnGround`, gravity and impulse derived from `JUMP_HEIGHT_PX` and `JUMP_DURATION_TICKS`) and wire steps 4 and 5 into `step` with the `jump` and `land` events; the run frame stays constant while airborne. Test the 2.2 jump rows (duration ± 1 tick, no double jump, identical trajectory against a control run, airborne time equal at speeds 6 and 12). **[Agent: typescript-canvas-frontend]**
  - [x] **3.2** Verify: run `npm run check`. Start `npm run preview` in the background recording its PID; with a throwaway Playwright script start a run, press Space, sample `__dino.state().dino.y` until landing and confirm the airtime is about 0.6 s, then hold Space and confirm only one jump. Delete the script and screenshots and stop the server by its PID. **[Agent: typescript-canvas-frontend]**

- [x] **Slice 4: Cacti approach at varying gaps**

  > Small and large cacti, singly or in groups of up to three, come toward the dinosaur; the first arrives 1.5 to 2.5 s after the start; every gap is clearable; cacti that leave the screen are gone. They do not collide yet.
  - [x] **4.1** Add `src/rng.ts`: `nextRandom` as pure mulberry32 over a `uint32` state and the `createRng` wrapper, with tests for the [0, 1) range and determinism. _(parallel: wave 4.A)_ **[Agent: typescript-canvas-frontend]**
  - [x] **4.2** Add the `cactusSmall` and `cactusLarge` sprites and an obstacle drawer in the `world` layer between ground and dino. Test with fixtures that each obstacle is drawn from its `kind` at its `x`, `y`. _(parallel: wave 4.A)_ **[Agent: typescript-canvas-frontend]**
  - [x] **4.3** Add `src/obstacles.ts` (`firstSpawnX`, `shouldSpawn`, `makeGroup`, `nextGapPx`, `advanceObstacles`) and wire `rngState` (built from the run's seed at start) and steps 6 and 7 into `step`: ids and `group` from 0 per run, one `spawnLog` entry and one `spawn` event per obstacle, absolute hitboxes, removal past the left edge. Add the `collisions` dependency (no effect until slice 5). Test the 2.3 rows: first arrival within `FIRST_ARRIVAL_TICKS` over seeds 0 to 199, both kinds by tick 1200, the gap bound over 10,000 samples at speeds 6, 9, 12, groups of at most `MAX_GROUP_SIZE` sharing one `group`, removal and strictly increasing ids. **[Agent: typescript-canvas-frontend]**
  - [x] **4.4** Verify: run `npm run check`. Start `npm run preview` in the background recording its PID; with a throwaway Playwright script start a run, screenshot after about 2 s and 10 s and confirm small and large cacti and a group are drawn in the palette, and that `__dino.state().obstacles` never holds an obstacle past the left edge. Delete the script and screenshots and stop the server by its PID. **[Agent: typescript-canvas-frontend]**

- [x] **Slice 5: Hitting a cactus ends the run**

  > Touching a cactus stops everything on that frame: hit pose, "GAME OVER", "Press SPACE to restart", final score still visible; near misses are forgiven; the screen stays frozen.
  - [x] **5.1** Add `src/collision.ts` (`intersects`, `hasCollision` over hitboxes) and test the near-miss row: overlapping sprite boxes with disjoint hitboxes do not collide. _(parallel: wave 5.A)_ **[Agent: typescript-canvas-frontend]**
  - [x] **5.2** Add the `dinoHit` sprite, the `world` drawer's hit pose, and the `hud` drawers for "GAME OVER" centred above the ground and the restart hint below it. Test with fixtures. _(parallel: wave 5.A)_ **[Agent: typescript-canvas-frontend]**
  - [x] **5.3** Wire step 9 into `step` (skipped when `collisions === false`): `phase 'dead'`, pose `'hit'`, `die` event; the dead phase freezes the run and emits nothing. HUD derivation: `hint 'restart'`, `gameOver true`, `blinkVisible true` outside running. Test the 2.5 rows: same-tick death fields, and 600 further ticks silent and unchanged. **[Agent: typescript-canvas-frontend]**
  - [x] **5.4** Extend the smoke test: without input the phase becomes `dead` within four seconds. **[Agent: typescript-canvas-frontend]**
  - [x] **5.5** Verify: run `npm run check`. Start `npm run preview` in the background recording its PID; with a throwaway Playwright script start a run without jumping, wait for `dead`, screenshot and confirm the hit pose, "GAME OVER" with the restart hint below it and the final score top right, then confirm the state is unchanged a second later. Delete the script and screenshots and stop the server by its PID. **[Agent: typescript-canvas-frontend]**

- [x] **Slice 6: One key press restarts a fresh run**

  > On the game-over screen SPACE or UP starts a new run at the starting pace with no old cacti and score `00000`; other keys do nothing; the tenth run behaves like the first.
  - [x] **6.1** Implement restart from `dead` per technical considerations 2.4 step 1: full reset from `tuning.ts` (new seed from `randomSeed()`, `rngState`, speed, `nextSpawnX`, obstacles, ids, groups, `spawnLog`, score, dino, HUD), emits only `restart`, `tick 0`. Test the 2.7 rows, including ten restarts with the same seed deep-equal at tick 300 (long runs) and one intent per key press after ten restarts. **[Agent: typescript-canvas-frontend]**
  - [x] **6.2** Verify: run `npm run check`. Start `npm run preview` in the background recording its PID; with a throwaway Playwright script die, press `KeyA` (still `dead`), press Space and confirm within half a second that the phase is `running`, the score is `0`, there are no obstacles and the speed equals `START_SPEED`; repeat ten times. Delete the script and screenshots and stop the server by its PID. **[Agent: typescript-canvas-frontend]**

- [x] **Slice 7: The pace rises during a run**

  > Cacti move about 1.3 times faster at 30 s and twice as fast from 90 s on, while the jump stays the same.
  - [x] **7.1** Add `speedAt(tick)` to `src/obstacles.ts`, use it in step 3, and emit `speedChange` when the 0.1x bucket changes; score and gaps already scale with speed. Test the 2.4 rows (`speedAt(1800) / START_SPEED` within 1.3 ± 0.05, `MAX_SPEED` at and after 5400, `state.speed` on long runs, the gap bound still met at higher speeds). **[Agent: typescript-canvas-frontend]**
  - [x] **7.2** Verify: run `npm run check` and confirm the 2.4 tests are among those that pass. No browser check: a 90-second wait adds nothing the unit tests do not prove. **[Agent: typescript-canvas-frontend]**

- [x] **Slice 8: Score milestones and the remembered high score**

  > The score blinks three times at every 100 and caps at `99999`; a better run updates `HI` on the game-over screen, `HI` survives a reload in the same browser, and no `HI` shows until one is recorded.
  - [x] **8.1** Add `isMilestone(before, after)` to `src/score.ts`, returning the multiple of `MILESTONE_EVERY` crossed or `null`, with tests at 99→100, 199→201 and below 100. _(parallel: wave 8.A)_ **[Agent: typescript-canvas-frontend]**
  - [x] **8.2** Extend the `hud` drawer: `HI` and the best score left of the score counter only when `hi !== null`, and the score hidden when `blinkVisible` is false. Test with fixtures. _(parallel: wave 8.A)_ **[Agent: typescript-canvas-frontend]**
  - [x] **8.3** Wire step 8's milestone handling (`blinkStartedAt`, `milestone` event with the multiple, `blinkVisible` per `BLINK_SCHEDULE`), the `MAX_SCORE` clamp, and step 9's high score rule (`score > (hi ?? 0)`, one `store.save`, `die.highScore` and `isNewHighScore`). Test the 2.6 rows, including a zero-score run with `hi === null` saving nothing. **[Agent: typescript-canvas-frontend]**
  - [x] **8.4** Extend the smoke test: after `page.reload()` the recorded score is shown as `hi`. **[Agent: typescript-canvas-frontend]**
  - [x] **8.5** Verify: run `npm run check`. Start `npm run preview` in the background recording its PID; with a throwaway Playwright script die once, reload, screenshot and confirm `HI` with the recorded score left of the score counter; open a new browser context and confirm no `HI`. Delete the script and screenshots and stop the server by its PID. **[Agent: typescript-canvas-frontend]**

- [x] **Slice 9: Replay the same course with `?seed=`**

  > `?seed=42` gives the same cacti in the same order at the same moments on every run and for every player; invalid seeds are ignored; without a seed each run differs.
  - [x] **9.1** Add `parseSeed` to `src/rng.ts` (whole numbers 0 to `MAX_SEED`, otherwise `undefined`) and test `'?seed=42'`, `'?seed=4294967295'`, `'?seed=4294967296'`, `'?seed=abc'`, `'?seed=-5'`, `'?seed=4.2'` and `''`. _(parallel: wave 9.A)_ **[Agent: typescript-canvas-frontend]**
  - [x] **9.2** Wire `deps.seed` in `src/game.ts` so a given seed is used for every start and restart and `randomSeed` is then never called. Test the 2.8 acceptance rows: identical `spawnLog` across a restart and across two games, deep-equal snapshots every 100 ticks to 3000, seed 42 against 43, and a scripted `randomSeed` `[1, 2]` without a seed. _(parallel: wave 9.A)_ **[Agent: typescript-canvas-frontend]**
  - [x] **9.3** Pass `parseSeed(location.search)` into `createGame` and `window.__dino` in `src/main.ts`, point the smoke test at `/?seed=42`, and add the assertion `__dino.seed === 42`, keeping the seven assertions of architecture section 5 in order. **[Agent: typescript-canvas-frontend]**
  - [x] **9.4** Verify: run `npm run check`. Start `npm run preview` in the background recording its PID; with a throwaway Playwright script open `/?seed=42` in two separate contexts, run 3 s in each and confirm the `spawnLog` kinds and ticks match; open `/?seed=abc` and confirm `__dino.seed` is `undefined`. Delete the script and screenshots and stop the server by its PID. **[Agent: typescript-canvas-frontend]**

- [x] **Slice 10: Feature Testing & Regression**

  > Verifies the whole feature end-to-end against functional-spec.md, run after all implementation slices are complete.
  - [x] Read functional-spec.md acceptance criteria in full. Generate acceptance-level tests that verify the entire feature as a whole — not individual slices. Cover applicable layers (unit for pure logic, integration for service interactions, e2e for user flows) based on the project's testing stack. Write tests with RED validation (must fail before implementation is confirmed done). Annotate each test with `@spec: 001-core-game` and `@regression` if suitable for long-term regression. **[Agent: testing-expert]**
  - [x] Run all generated tests. All must pass. Fix any failures before proceeding. **[Agent: testing-expert]**

## Open Questions

_Recorded by the testing-expert audit (slice 10). No criterion is an implementation gap; these are criteria whose automated coverage is partial or limited by the test boundary._

- 2.6 "a run that ends with a score not higher than the best leaves `HI` unchanged", for a zero-score run with no best recorded: a zero-score death cannot happen through `createGame` (the first cactus arrives after about 15 points), so this case is proven only at unit level by `tests/score.test.ts` › "beatsHighScore is false for a zero-score run with no recorded best, so nothing is saved".
- 2.6 "the best score is personal to the browser" (different browser or private window shows no `HI`): this is a property of `localStorage` itself. Automated coverage is `tests/game.acceptance.test.ts` › "shows no HI when no best score was ever recorded" and the smoke test's fresh Playwright context plus reload round trip; no test opens a second browser profile, because the smoke test is limited to the seven assertions of architecture section 5.
- 2.9 "every drawn element uses the same single dark grey": `tests/render.test.ts` proves every `fillStyle` is a `PALETTE` value and every `fillRect` lands on whole pixels, so sprites and ground are pure palette colours. Text drawn with `fillText` is anti-aliased by the browser, so the edges of "GAME OVER", the hints and the score contain intermediate greys. No automated test can make this stricter without a pixel comparison, which architecture section 5 rules out. Decide whether anti-aliased text edges meet the criterion. **Decided 2026-10-19 during `/awos:verify` by the author: yes.** Anti-aliased text edges meet 2.9; the measured game-over frame had no off-palette hue, only #f7f7f7, #535353, #c4302b and grey blends at glyph edges.
- 2.8 "a seed that is not a whole number is ignored": proven by `tests/rng.test.ts` › `parseSeed` (`'?seed=abc'`, `'?seed=-5'`, `'?seed=4.2'` give `undefined`) and by the unseeded `createGame` tests; the browser wiring is exercised only for `?seed=42`, since the smoke test cannot add assertions.
- 2.9 "a hidden tab does not fast-forward": proven by the `frame()` accumulator tests (a 10,000 ms gap runs exactly 6 steps) and by `attachKeyboard` releasing keys when the page is hidden; no test hides a real browser tab.
