# Technical Specification: Halloween Edition

- **Functional Specification:** [functional-spec.md](functional-spec.md)
- **Status:** Draft
- **Author(s):** Nikola, with the `typescript-canvas-game` specialist

---

## 1. High-Level Technical Approach

Three layers, built in order so the game is runnable after each:

1. **Night (cosmetic):** retune the palette, swap the cactus bitmaps for pumpkins, and add two cosmetic features, `night-sky` and `reactions`, in the `installX({ game, renderer })` pattern of `src/features/puddle.ts`. No gameplay state changes.
2. **Bats (gameplay):** a duck input and pose, and a bat list that is separate from `obstacles`.
3. **Hat, candies, hearts (gameplay):** pickups in their own lists, a heart counter, and a changed crash rule.

Key decision: every new entity lives in **new `GameState` fields, not in `obstacles`**. `spawn`, `spawnLog`, `nextGroup()` in the regression tests, and the pumpkin random draws stay untouched. Each new system has its **own random stream**, `(seed ^ SALT) >>> 0`, driven by `nextRandom` from `src/rng.ts`, so adding bats or pickups never changes the pumpkin course before the first bat. Frozen names stay (`Sprites.cactusSmall`, `Sprites.cactusLarge`, `LARGE_CACTUS_PROBABILITY`, `'small' | 'large'`); only bitmaps and values change. Pure logic goes in new modules so `game.ts` only gets integration edits.

---

## 2. Proposed Solution & Implementation Plan (The "How")

### 2.1 Pumpkins and palette (spec 2.1, 2.5)

- `src/sprites.ts`: replace the two cactus bitmaps with pumpkins, keeping 17x35 and 25x50 and the existing hitboxes. `makeSprite` accepts a third bitmap character for the glowing carved face; `Sprite` gains `glowRuns`, and `runs` stays foreground only. `drawSprite` in `src/render.ts` fills `runs` with `fg`, then `glowRuns` with `accent`. Optional aliases `Sprites.pumpkinSmall` and `Sprites.pumpkinLarge` point at the same objects.
- `src/tuning.ts` `PALETTE` (flat strings; the render test requires every `fillStyle` to be a `PALETTE` value):

| Key | Role | Value |
| --- | --- | --- |
| `bg` | dusk navy, the renderer's clear colour | dark navy |
| `fg` | dino, ground, obstacles, text | pale grey |
| `accent` | the one orange: pumpkin faces, sparks, candies, hearts, hat band, puddle | orange |
| `dim` (new) | clouds, stars | mid grey-blue |
| `moon` (new) | moon | off-white |
| `skyDark` (new) | night overlay colour | near-black navy |

- `src/style.css`: the hard-coded page background follows `bg`. The puddle needs no change because it already uses `PALETTE.accent`.

### 2.2 Night sky and survival effect (spec 2.2, 2.3) — `src/features/night-sky.ts`

- `installNightSky({ game, renderer })` registers one `background` layer: overlay, moon, stars, clouds, glowing eyes. State resets on `start` and `restart`; it returns `dispose()`.
- Pure exports for unit tests: `nightLevel(tick)` (linear, clamped 0 to 1, full at `NIGHT_DARKEST_TICK`), `starCount(tick)`, `eyesActive(tick)`, `cloudX(index, frameCount)`, `moonBounce(age)`.
- Darkness is `skyDark` filled at `globalAlpha = nightLevel * NIGHT_MAX_ALPHA`, so no colour interpolation is needed.
- Clouds and the moon bounce use the render `frame.count`, so they keep moving on the frozen game-over screen. Stars, eyes and the overlay use `state.tick`, which resets on restart. Star and eye positions come from `createRng((state.seed ^ NIGHT_SALT) >>> 0)` and are built once per run over a fixed pool.
- Tuning (ticks at 60 per second): `NIGHT_DARKER_TICK = 1800`, `NIGHT_STARS_TICK = 2700`, `NIGHT_EYES_TICK = 3600`, `NIGHT_DARKEST_TICK = 5400`, plus `STARS_BASE`, `STARS_EXTRA`, `NIGHT_MAX_ALPHA`, `CLOUD_COUNT`, `EYES_PAIRS`.

### 2.3 Reactions (spec 2.4) — `src/features/reactions.ts`

- Owns `renderer.setCamera` (only one camera function exists) and applies the largest active shake.
- Triggers: `land` and `heartLost` give a shake of at most `SHAKE_LAND_PX = 3` over 12 frames; `die` gives a stronger shake and an orange flash of at most `FLASH_ALPHA = 0.25` for at most 12 frames; `jump` gives a spark burst at the feet and (via night-sky) a moon bounce; `milestone` gives sparks, or on every fifth milestone a bat silhouette and a blink of eyes; `hatCaught` and `candyEaten` give spark bursts.
- Pure exports: `shakeOffset(kind, age)`, `flashAlpha(age)`, `makeBurst(rng, x, y, n)`, `particleAt(p, age)`, `scareAt(age)`. Drawing uses only `fillRect`, `fillStyle`, `globalAlpha`. Layers: flash on `background`, world sparks on `foreground`, score sparks and the scare on `hud`.
- Particles use its own `createRng((seed ^ REACTION_SALT) >>> 0)`; time is `startedAt ??= frame.count`, as in the puddle. It never writes `GameState`.

### 2.4 Ducking (spec 2.6)

- `src/types.ts`: `Intent` gains `'duckDown'` and `'duckUp'`; `DinoPose` gains `'duck'`; `GameEvent` gains `duckStart` and `duckEnd`.
- `src/input.ts`: `ArrowDown` keydown (not a repeat) yields `duckDown`; `keyUp` and `reset` now return `Intent | null`, giving `duckUp` only if the key was held. `src/input-dom.ts` calls `preventDefault` for `ArrowDown` and forwards key-up, blur and tab-hidden releases through `onIntent`.
- `src/game.ts`: `RunState.ducking`, true only while grounded. Duck intents bypass the one-per-step primary queue, via a last-wins `pendingDuck` slot, so they never delay a jump. Order inside a step: duck change, then jump (a jump clears `ducking`), then gravity and landing (landing leaves `ducking` false, so a key held across a landing lands standing). Duck in idle, dead or in the air is a silent no-op. `freshRun` clears both.
- `projectDino` uses new `Sprites.dinoDuck0` and `Sprites.dinoDuck1` and pose `'duck'`; physics `y` is unchanged, only the projected `y` and hitbox change (hitbox height 24, bottom unchanged). `dinoSprite()` in `render.ts` gets a `'duck'` case (`assertNever` forces it).

### 2.5 Bats (spec 2.7) — `src/bats.ts` plus `game.ts` integration

- `GameState.bats: readonly Bat[]`, where `Bat` is a `Rect` with `id`, `hitbox` and a derived two-frame `wing`. New event `batSpawn`.
- Hitbox: top at `GROUND_Y - 85`, height 52. That overlaps a standing dino and a dino at every jump height from 0 to 70, and clears the ducking hitbox by about 7 px.
- Spawn: its own stream `BAT_SALT`; `nextBatTick` is drawn at run start in `[BAT_FIRST_TICK = 1500, 2100]`, then every `[BAT_INTERVAL_TICKS = 480..900]`. A bat is placed only when the space from the trailing edge of all obstacles to the right edge is at least `minGapPx(laterSpeedBound(...))`, otherwise the attempt retries next tick. After placing a bat, `nextSpawnX` is raised to at least the bat's right edge plus the same gap, which only widens a pumpkin gap and keeps pumpkin random draws unchanged. Bat-to-bat minimum is `BAT_TO_BAT_TICKS`.
- Bats scroll with the world speed and are removed once fully off the left edge. Collision uses `hasCollision`, widened to accept `readonly { readonly hitbox: Rect }[]`.

### 2.6 Hat, candies, hearts (spec 2.8, 2.9)

- `GameState` gains `hat: Hat | null`, `candies`, `hearts`, `candyTime`, `invulnTicks` and `hud.dinoVisible` (blink derived in `project`: hidden while `invulnTicks > 0` on alternate `INVULN_BLINK_TICKS` blocks).
- Hat: own stream `HAT_SALT`, first at `HAT_FIRST_TICK = 1800`, respawn in `HAT_RESPAWN_TICKS`, hitbox at `GROUND_Y - 110` so only an airborne dino reaches it, kept `HAT_CLEAR_TICKS` away from obstacles and bats. Once caught, none respawns that run.
- Candies: stream `CANDY_SALT`, only when `candyTime`, interval `CANDY_INTERVAL_TICKS = [240, 480]` (so one appears within 10 s), on the ground, deferred while within `CANDY_CLEAR_PX` of an obstacle.
- `stepCollision` becomes ordered sub-steps: catch hat (sets `candyTime`, emits `hatCaught`), eat candy (`hearts = min(MAX_HEARTS = 3, hearts + 1)`, emits `candyEaten`), then hit test over `[...obstacles, ...bats]`: during `invulnTicks` nothing; with hearts, lose one, set `invulnTicks = INVULN_TICKS = 90`, emit `heartLost`, **no `die`**; with none, the existing die path including the high score. `invulnTicks` counts down at the start of each running step. Score and distance never read hearts.
- New events: `hatSpawn`, `candySpawn`, `hatCaught`, `candyEaten { hearts }`, `heartLost { hearts }`. Within a step the order is `speedChange`, `jump`/`duck*`, `land`, spawns, `milestone`, `hatCaught`, `candyEaten`, `heartLost` or `die`, `tick` last.
- `render.ts`: hearts at the top-left in `accent`, a "candy time" mark under them, and hat, candy and bat sprites on the `world` layer. `main.ts` installs `installNightSky` first, then `installPuddle` and `installReactions`.

### 2.7 Frozen contract and documentation

Everything above only **adds** to the frozen surface (events, state fields, tuning names, intents). Update `context/product/architecture.md` section 3: new event rows (`duckStart`, `duckEnd`, `batSpawn`, `hatSpawn`, `candySpawn`, `hatCaught`, `candyEaten`, `heartLost`), the changed `die` row ("only with no hearts and not protected"), the new state fields, and the palette note. Every new `switch` ends in `assertNever`. The README wording moves from cacti to pumpkins.

---

## 3. Impact and Risk Analysis

- **System dependencies:** `game.ts`, `types.ts`, `tuning.ts`, `events.ts`, `render.ts`, `sprites.ts`, `input.ts`, `input-dom.ts`, `main.ts`, `style.css`, two new features, two new pure modules (`bats.ts`, `pickups.ts`).
- **Determinism:** bats, hat, candies, stars and particles use only their own streams, so the course is byte-identical to today before tick 1500. After the first bat, pumpkin gaps can grow slightly because of the widening rule. `freshRun` must rebuild every stream and clear `pendingDuck`, or restart is not a full reset.
- **Fairness:** the bat and hat placement rules reuse `minGapPx` and `trailingEdge`. A perfect-play bot test over many seeds guards "never forced into a crash".
- **Existing tests that will break** (to be fixed in the same slice that causes them): exact `GameState` `toEqual` literals (new fields); the `createBus` handler map and event-name lists; sprite key and size tests; render tests that count obstacle `fillRect` calls (extra glow rects); the dino pose switch; input tests expecting `keyUp` or `reset` to return nothing; any assertion that a long-run gap stays at or below `MAX_GAP_FACTOR` times the minimum.
- **`tests/regression.acceptance.test.ts`:** test 2.3 plays 1800 ticks with jumps only and would meet the first bat. Change it to play until `BAT_FIRST_TICK` (or use a duck-aware bot) and add the `@spec: 002-halloween-edition` tag. `ArrowDown` is moved out of `OTHER_KEYS` into the duck tests. This edit is allowed by the exercise rules, and the spec's ducking section supersedes the old "other keys" rule.
- **Visual risk:** dark background with the old grey would be unreadable, so `fg` is retuned with the palette; the "no other hue" rule is checked by a test over `PALETTE`.
- **Time risk:** 50 minutes. Tier 1 is complete after slice 3 and Tier 2 after slice 4, so a cut can fall on a slice boundary.

---

## 4. Testing Strategy

Vitest in Node, mirroring `src/`, driven by `createGame` with a stubbed `randomSeed`, an in-memory store, `tick(n)`, and `collisions: false` where only the sky matters. Every new test fails before its change (RED). Shared helpers added to `tests/helpers.ts`: `duckDown(game)`, `duckUp(game)` and a duck-aware `playBot(game, ticks, { duckBats, catchHat })` (moved from `playWellTimed`).

| Spec section | Test file | What it proves |
| --- | --- | --- |
| 2.1, 2.5 | `tests/sprites.test.ts`, `tests/render.test.ts` | pumpkin sizes unchanged, glow runs present, every `fillStyle` is a `PALETTE` value, no off-hue colour, puddle uses `accent` |
| 2.2, 2.3 | `tests/night-sky.test.ts` | `nightLevel` at 0, 1800 and 5400; more stars at 2700; no eyes before 3600; clouds wrap and keep moving when dead; tick reset on restart |
| 2.4 | `tests/reactions.test.ts` | land shake at most 3 px and zero by frame 12; flash alpha at most 0.25; milestone 100 vs 500 branch; sparks gone in 30 frames; only allowed draw calls; reset on restart |
| 2.6 | `tests/input.test.ts`, `tests/input-dom.test.ts`, `tests/duck.acceptance.test.ts` | duck down, up, repeat ignored, blur release; pose and hitbox; duck then jump; no-op in air, idle, dead; landing while held stays standing |
| 2.7 | `tests/bats.acceptance.test.ts` | none before tick 1500 over 40 seeds; one by tick 3600; stand, jump, duck outcomes; near miss; removal; gap rules |
| 2.8, 2.9 | `tests/pickups.acceptance.test.ts` | none before 1800; catch only in the air; one hat; no candies before the catch; heart cap 3; heart loss and protection; no hearts means die |
| 2.10, 2.11 | `tests/halloween.acceptance.test.ts` | restart clears everything; same seed same bats, hat, candies; different seed differs; score rate unchanged; a perfect bot survives 3 minutes on about 10 seeds |

End-to-end: the single smoke test keeps proving wiring only; it must still pass with seed 42 dying at the first pumpkin. The 2.10 tick-level checks stay in unit and acceptance tests, not in e2e.
