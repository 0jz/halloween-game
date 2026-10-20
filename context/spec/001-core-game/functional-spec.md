# Functional Specification: Core Game

- **Topic:** The complete first version of the Dino Runner: starting a run, running and jumping over cacti, speeding up, crashing, scoring, keeping a high score, restarting, and replaying the same course on demand.
- **Status:** Completed
- **Author:** Daria Garanina

---

## 1. Overview and Rationale (The "Why")

The product is a browser version of the classic "no internet" dinosaur game. This specification covers everything a player needs for the game to be complete and fun on its own: a run starts with one key press, the dinosaur jumps over cacti that arrive at varying gaps, the pace rises the longer the player survives, a crash ends the run with a clear game-over screen, the score and best score are shown, and one key press starts again.

Two groups rely on this version. Players want thirty seconds of fun with no setup. Learners will use this game as a codebase to study and extend, so the first version must be complete, predictable, and free of half-finished features; everything cosmetic that is not needed for the core loop is deliberately left for a later version.

Success looks like this: a first-time player starts a run within 5 seconds of the page loading without reading anything but the on-screen hint, plays at least three runs in their first minute, and understands at the end of each run exactly why it ended and how they did.

---

## 2. Functional Requirements (The "What")

### 2.1 Start screen and starting a run

- When the page opens, the player sees the game area with the dinosaur standing on the ground at the left, a flat ground line, an empty sky, the score counter reading `00000` in the top-right corner, and the hint "Press SPACE to start" centred in the game area.
  - **Acceptance Criteria:**
    - [x] When the page finishes loading, then the dinosaur is standing still, no cacti are visible, the score shows `00000`, and the hint "Press SPACE to start" is visible. _(Verified 2026-10-19: browser: phase idle, 0 obstacles, score 0, hint 'start', pose stand; docs/screenshots/001-core-game-start-screen.png.)_
    - [x] Given a best score was recorded in an earlier visit from the same browser, when the page opens, then `HI` followed by that best score is shown to the left of the score counter. _(Verified 2026-10-19: browser: after a death and reload, `HI 00161` shown; docs/screenshots/001-core-game-hi-after-reload.png.)_
    - [x] Given no best score has ever been recorded, when the page opens, then no `HI` label is shown. _(Verified 2026-10-19: browser: fresh profile, `hi` null; docs/screenshots/001-core-game-no-hi-fresh-browser.png.)_
    - [x] When the player presses SPACE or the UP arrow on the start screen, then the hint disappears, the dinosaur starts running, and the score starts counting. _(Verified 2026-10-19: browser: SPACE and ArrowUp each start the run (hint gone, pose run, score 5 after 0.5 s).)_
    - [x] When the player presses any other key on the start screen, then nothing changes. _(Verified 2026-10-19: browser: KeyA, Enter, ArrowDown leave the state byte-identical.)_

### 2.2 Running and jumping

- During a run the dinosaur runs in place on the left while the ground and cacti move toward it. The player's only action is to jump.
  - **Acceptance Criteria:**
    - [x] Given the dinosaur is on the ground during a run, when the player presses SPACE or the UP arrow, then the dinosaur jumps and lands back on the ground about 0.6 seconds later. _(Verified 2026-10-19: browser: airborne 35 ticks (0.58 s), 600 ms from key press to landing; docs/screenshots/001-core-game-jump-apex.png.)_
    - [x] Given the dinosaur is in the air, when the player presses SPACE or the UP arrow, then nothing changes (no second jump, no change to the jump already in progress). _(Verified 2026-10-19: browser: SPACE and ArrowUp pressed mid-air, still one airborne interval of 35 ticks.)_
    - [x] Given the dinosaur is on the ground, when the player holds SPACE down, then the dinosaur jumps once and does not jump again until the key is released and pressed again. _(Verified 2026-10-19: browser: SPACE held 1.3 s, exactly one jump.)_
    - [x] When the player presses SPACE anywhere in the game, then the page does not scroll. _(Verified 2026-10-19: browser: `scrollY` 0 before and after; smoke test asserts `defaultPrevented` on Space.)_
    - [x] When the dinosaur runs on the ground, then its legs visibly alternate, so it reads as running rather than sliding. _(Verified 2026-10-19: browser: run frame sampled 0,0,1,1,0,0,1,1; docs/screenshots/001-core-game-running-legs-a.png, docs/screenshots/001-core-game-running-legs-b.png.)_

### 2.3 Cacti

- Cacti are the only obstacle. They come in two sizes, small and large, and appear singly or in tight groups of up to three small ones. Gaps between obstacles vary so the player cannot jump on a fixed rhythm, but every gap is long enough to be cleared by a player who reacts in time.
  - **Acceptance Criteria:**
    - [x] When a run starts, then the first cactus reaches the dinosaur between 1.5 and 2.5 seconds after the start. _(Verified 2026-10-19: browser: first cactus reached the dinosaur at 1.98 s (seed 7) and at 2.07 to 2.40 s on five restarts.)_
    - [x] When cacti appear during a run, then both a small and a large cactus have appeared within the first 20 seconds of any run that lasts that long. _(Verified 2026-10-19: browser: seed 7 showed large at tick 1 and small at tick 139; unit tests cover seeds 0 to 199.)_
    - [x] When two consecutive obstacles appear, then the gap between them is never shorter than the distance the dinosaur covers during one full jump plus a reaction margin of half a second at the current pace. _(Verified 2026-10-19: browser: 93 s autopilot run, 8 gaps between groups, smallest 1.05 times the required gap, 0 shorter.)_
    - [x] When a group of cacti appears, then it contains at most three cacti standing directly next to each other, and a group is cleared with a single well-timed jump. _(Verified 2026-10-19: browser: largest group 3, members adjacent, all 22 multi-cactus groups cleared with one jump each; docs/screenshots/001-core-game-cacti-group.png.)_
    - [x] When a cactus has moved fully past the left edge of the game area, then it is gone and does not reappear. _(Verified 2026-10-19: browser: 0 obstacles past the left edge over 5,605 ticks.)_

### 2.4 Pace increases during a run

- The longer the player survives, the faster everything moves, until a maximum pace is reached.
  - **Acceptance Criteria:**
    - [x] When a run has lasted 30 seconds, then cacti visibly cross the game area faster than they did in the first 5 seconds of the same run (about 1.3 times the starting pace). _(Verified 2026-10-19: browser: speed 8 at 30 s, 1.33 times the start; docs/screenshots/001-core-game-pace-5s.png, docs/screenshots/001-core-game-pace-30s.png.)_
    - [x] When a run has lasted 90 seconds, then the pace stops increasing and stays at about twice the starting pace for the rest of the run. _(Verified 2026-10-19: browser: speed 12 at tick 5400 and still 12 at tick 5605; docs/screenshots/001-core-game-max-pace.png.)_
    - [x] When the pace increases, then the dinosaur's jump height and jump duration stay the same, so gaps remain clearable. _(Verified 2026-10-19: browser: all 45 jumps lasted 35 ticks with the same apex (y 143) at speeds from 6.1 to 12.)_

### 2.5 Crashing and the game-over screen

- Touching a cactus ends the run.
  - **Acceptance Criteria:**
    - [x] When any part of the dinosaur's body touches any part of a cactus, then the run ends on that same frame: all movement stops, the dinosaur switches to a "hit" pose with an X for an eye, and the text "GAME OVER" appears centred above the ground. _(Verified 2026-10-19: browser: at the death frame the hitboxes touch, state frozen, pose hit, game over shown; docs/screenshots/001-core-game-game-over.png, docs/screenshots/001-core-game-hit-pose-zoom.png.)_
    - [x] When the dinosaur passes a cactus with visible daylight between its body and the cactus, then the run continues (a near miss is not a crash). _(Verified 2026-10-19: browser: sprite boxes overlapped for 3 frames with disjoint hitboxes, run continued; docs/screenshots/001-core-game-near-miss.png.)_
    - [x] When the run ends, then the final score stays visible in the top-right corner and the hint "Press SPACE to restart" appears below "GAME OVER". _(Verified 2026-10-19: browser: final score kept, hint 'restart' below GAME OVER; docs/screenshots/001-core-game-game-over.png.)_
    - [x] When the run ends, then the screen stays frozen on the crash until the player acts; nothing restarts on its own. _(Verified 2026-10-19: browser: state byte-identical 3 s after the crash.)_
    - [x] When the run ends, then a small red puddle spreads out on the ground under the dinosaur over about half a second, and then stays at its full size while the game-over screen is showing. _(Verified 2026-10-19: browser: red pixels 0, 66, 168, 168 at death, 0.15 s, 1 s and 3 s; docs/screenshots/001-core-game-puddle-growing.png.)_
    - [x] When a new run starts after a crash, then the red puddle is gone. _(Verified 2026-10-19: browser: 0 red pixels after the restart; docs/screenshots/001-core-game-after-restart.png.)_

### 2.6 Score and high score

- The score measures how far the player has run. The best score ever achieved in this browser is remembered.
  - **Acceptance Criteria:**
    - [x] When a run is in progress, then the score in the top-right corner increases steadily, by about 10 points per second at the starting pace and faster as the pace increases. _(Verified 2026-10-19: browser: score 51 at 5 s at start pace, 350 at 30 s with the pace at 1.33 times.)_
    - [x] When the score is displayed, then it is always shown as five digits with leading zeros (for example `00042`); a score that would exceed 99999 stops counting and stays at `99999`. _(Verified 2026-10-19: five digits in every screenshot; the 99999 cap is proven by unit tests `scoreFromDistance caps at MAX_SCORE`, `formatScore caps anything above MAX_SCORE` and the acceptance run that reaches it.)_
    - [x] When the score reaches a multiple of 100, then the score counter blinks briefly (three quick flashes within about a second) and then returns to normal. _(Verified 2026-10-19: browser: score hidden on ticks 570 to 579 at score 100, then the next flashes, per `BLINK_SCHEDULE`.)_
    - [x] Given the final score of a run is higher than the recorded best, when the run ends, then the `HI` value updates to the new score on the game-over screen. _(Verified 2026-10-19: browser: a run of 161 over a best of 23 shows `HI 00161` on game over; docs/screenshots/001-core-game-new-hi.png.)_
    - [x] Given the final score of a run is not higher than the recorded best, when the run ends, then the `HI` value is unchanged. _(Verified 2026-10-19: browser: a replayed run that scored 23 against a best of 23 left `HI` at 23.)_
    - [x] Given a best score was recorded, when the player closes the page and opens it again in the same browser, then the same `HI` value is shown. _(Verified 2026-10-19: browser: `HI 00161` after reload; docs/screenshots/001-core-game-hi-after-reload.png.)_
    - [x] Given a best score was recorded in one browser, when the page is opened in a different browser or in a private window, then no `HI` is shown (the best score is personal to the browser). _(Verified 2026-10-19: browser: new browser profile shows no `HI`; docs/screenshots/001-core-game-no-hi-fresh-browser.png.)_

### 2.7 Restarting

- After a crash, one key press starts a completely fresh run.
  - **Acceptance Criteria:**
    - [x] Given the game-over screen is showing, when the player presses SPACE or the UP arrow, then a new run starts within half a second: the score reads `00000`, no cacti from the previous run are visible, and the dinosaur is running on the ground. _(Verified 2026-10-19: browser: new run within 10 to 23 ms, score 0, no obstacles, running on the ground; docs/screenshots/001-core-game-after-restart.png.)_
    - [x] When a new run starts after a crash, then the pace is the same starting pace as a run started from the start screen, regardless of how fast the previous run had become. _(Verified 2026-10-19: browser: restart after a run at speed 12 starts at speed 6.)_
    - [x] When a new run starts after a crash, then the first cactus again arrives between 1.5 and 2.5 seconds after the restart. _(Verified 2026-10-19: browser: first cactus at 2.07 to 2.40 s after five restarts.)_
    - [x] Given the game-over screen is showing, when the player presses any key other than SPACE or the UP arrow, then nothing changes. _(Verified 2026-10-19: browser: KeyA and Enter on the game-over screen leave the state byte-identical.)_
    - [x] When the player restarts ten times in a row, then the game behaves on the tenth run exactly as it did on the first (same starting pace, one jump per key press, same responsiveness). _(Verified 2026-10-19: browser: 11 restarts in a row, each at speed 6 within 23 ms, one jump per key press every time.)_

### 2.8 Replaying the same course

- For practice, teaching, and checking, a run can be made to repeat the same sequence of cacti every time.
  - **Acceptance Criteria:**
    - [x] When the player opens the page with `?seed=` followed by a whole number added to the address (for example `?seed=42`), then every run started on that page presents cacti of the same sizes, in the same order, at the same moments. _(Verified 2026-10-19: browser: `?seed=42`, two runs on one page, identical spawn logs.)_
    - [x] When the value after `?seed=` is not a whole number (for example `?seed=abc` or `?seed=-5`), then the game behaves as if no seed had been given. _(Verified 2026-10-19: browser: `?seed=abc` and `?seed=-5` give `__dino.seed` undefined and different courses per run.)_
    - [x] When two players open the page with the same `seed` number, then they see the same course. _(Verified 2026-10-19: browser: two separate profiles on `?seed=42` produced identical spawn logs; docs/screenshots/001-core-game-seed-42-tab-a.png, docs/screenshots/001-core-game-seed-42-tab-b.png.)_
    - [x] When the player opens the page with a different `seed` number, then the course differs. _(Verified 2026-10-19: browser: `?seed=43` gives a different spawn log; docs/screenshots/001-core-game-seed-43.png.)_
    - [x] When the player opens the page without a `seed` in the address, then consecutive runs present different courses. _(Verified 2026-10-19: browser: no seed, two consecutive runs had different seeds and spawn logs.)_
    - [x] When a `seed` is used, then nothing else about the game changes: scoring, pace, controls and screens behave exactly as without it. _(Verified 2026-10-19: browser: seeded and unseeded runs follow the same speed and score curve; unit tests check the seed changes only the course.)_

### 2.9 Look and layout

- The game has the plain, pixel-art look of the original: dark grey shapes on a near-white background, one consistent palette, no decoration. The only exception is the red puddle on the game-over screen.
  - **Acceptance Criteria:**
    - [x] When the page opens on a laptop screen at least 1024 pixels wide, then the whole game area (a fixed-size landscape rectangle, 800 by 300 pixels) is visible, centred horizontally, without scrolling. _(Verified 2026-10-19: browser 1280 by 800: canvas 800 by 300 at x 240, no scroll; docs/screenshots/001-core-game-layout-1280.png.)_
    - [x] When the page opens in a window too small for the full game area, then the game area shrinks to fit inside the window with a small margin, keeps its landscape shape, stays centred, and the page does not scroll sideways; the game plays exactly the same, only smaller. _(Verified 2026-10-19: browser: 400 by 700 gives 368 by 138 at x 16; 900 by 250 gives 581 by 218; never a sideways scroll; docs/screenshots/001-core-game-small-window-400.png, docs/screenshots/001-core-game-small-window-400-running.png.)_
    - [x] When the window is resized while the page is open, then the game area grows or shrinks to fit again, never beyond its normal 800 by 300 size, without restarting or interrupting the run. _(Verified 2026-10-19: browser: resized mid-run 400 to 1920 to 900 by 250 to 600 wide; at most 800 by 300, same seed, tick 90 to 182, still running.)_
    - [x] When the page is open, then every drawn element (dinosaur, cacti, ground, text) uses the same single dark grey on the same near-white background; the red puddle after a crash is the only other colour. _(Verified 2026-10-19: browser: 0 off-palette pixels at game over (only #f7f7f7, #535353, #c4302b and grey blends at text edges); the author accepted anti-aliased text edges as meeting this criterion.)_
    - [x] Given a run is in progress, when the player switches to another browser tab for ten seconds and comes back, then the game has not fast-forwarded: at most a fraction of a second of play has elapsed and the dinosaur has not died while the tab was hidden. _(Verified 2026-10-19: checked manually by the author with a real tab switch; in a real browser a 138 ms frame gap advanced exactly 6 steps (the 100 ms clamp).)_

---

## 3. Scope and Boundaries

### In-Scope

- Start screen with hint; starting a run with SPACE or UP arrow.
- Running dinosaur with a two-frame run animation and a hit pose.
- Single jump of fixed height; no jump while airborne; holding the key does not repeat jumps.
- Small and large cacti, singles and groups of up to three, with clearable, varying gaps.
- Pace that rises to about twice the starting pace by 90 seconds, then holds.
- Crash detection that forgives near misses; frozen game-over screen with "GAME OVER", a restart hint and a red puddle under the dinosaur.
- Five-digit score, blink at every 100, best score shown as `HI` and remembered per browser.
- Restart that starts a completely fresh run with nothing carried over except the best score.
- A `seed` number in the page address that makes the course repeat exactly.
- Plain monochrome pixel-art look in an 800 by 300 game area that shrinks to fit smaller windows, with red used only for the game-over puddle.

### Out-of-Scope

- Everything visual beyond the plain look: backgrounds, clouds, parallax, day/night, particles, screen shake, richer animation. These are the subject of the next version, "make it shine".
- Sound and music.
- Flying obstacles and ducking.
- Pause.
- Mouse, touch or gamepad controls; mobile layout; making the game area larger than 800 by 300 on big screens.
- Power-ups, lives, difficulty settings, or any way to change the game's rules.
- Online leaderboards, accounts, sharing scores, or any network feature.
- Localisation of the on-screen text.

---

## Change Log

_Dated amendments made after the spec was first written — typically by `/awos:spec` in Update Mode when a bug fix changed documented behavior. Each entry records the date, the source reference (bug id or fix description), and what behavior changed and why. Leave empty until the first amendment._

- **2026-10-19 — Red puddle on game over (requested by the author after play-testing).** Section 2.5 gains two criteria: when the run ends, a small red puddle spreads out under the dinosaur over about half a second and then stays, and it is gone when a new run starts. Section 2.9 and the scope now allow red as the one colour besides the dark grey, used only for that puddle. Why: the game-over moment should read at a glance, beyond the text and the hit pose.
- **2026-10-19 — X for an eye in the hit pose (requested by the author after play-testing).** Section 2.5's crash criterion now says the hit pose has an X for an eye instead of wide eyes. Why: a crossed-out eye is the familiar cartoon sign for "knocked out" and reads more clearly at the game's small size.
- **2026-10-19 — The game area shrinks to fit small windows (requested by the author).** Section 2.9 gains two criteria: in a window too small for 800 by 300 the game area shrinks to fit with a margin, keeps its shape and the page does not scroll sideways; resizing the window refits it without interrupting the run, never above 800 by 300. The out-of-scope list no longer excludes resizing in general, only enlarging beyond 800 by 300; mobile layout and touch controls stay out of scope. Why: the game should stay fully visible on small laptop screens and narrow browser windows.
