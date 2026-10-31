# Functional Specification: Halloween Edition

- **Topic:** A Halloween edition of the Dino Runner for the week of October 31: pumpkins instead of cacti, a moonlit night sky that grows darker and stranger the longer the player survives, small spooky reactions to what the player does, bats the player must duck under, and a witch's hat that unlocks candies and hearts that soften a crash.
- **Status:** Completed
- **Author:** Nikola

---

## 1. Overview and Rationale (The "Why")

Marketing wants a Halloween edition of the game for the week of October 31. The classic game stays the game: the dinosaur still runs by itself, the player still jumps with SPACE or the UP arrow, the pace still rises, a crash still ends the run, and one key press still restarts it. What changes is the world around the dinosaur and a small number of new things to deal with.

This edition builds on the core game and deliberately replaces several of its choices. The core game lists a plain look, a single dark-grey-on-white palette, flying obstacles, ducking, lives and power-ups as things it would not do. Those were the right limits for the first version. This edition is the "make it shine" version they were saved for, so wherever this document says something different from the core game, this document wins for the Halloween edition.

The edition is built in three layers, each one complete and playable without the next:

1. **The night:** pumpkins, a night sky with a moon and drifting clouds, a night that changes the longer the player survives, and small reactions to jumping, landing, crashing and reaching a milestone.
2. **The bats:** a new obstacle that is cleared by ducking instead of jumping.
3. **The witch's hat:** an occasional catch that switches on candies, and candies that give hearts which soften a crash.

Success looks like this: a player who knows the original game recognises it at once, understands within one run that bats need ducking, never feels a crash was unfair, and a screenshot of the game at any moment reads clearly as "Halloween" in a single visual style.

---

## 2. Functional Requirements (The "What")

### 2.1 Pumpkins instead of cacti

- Every obstacle that was a cactus in the core game is now a pumpkin. A small pumpkin and a large pumpkin take the place of the small and large cactus, appear singly or in tight groups of up to three small ones, and are cleared by jumping exactly as cacti were. Each pumpkin has a carved face that glows in the orange accent colour.
  - **Acceptance Criteria:**
    - [x] When a run starts and the first obstacle approaches, then it is a pumpkin with a glowing carved face and no cactus is visible anywhere in the game.
    - [x] When pumpkins appear during a run, then both a small and a large pumpkin have appeared within the first 20 seconds of any run that lasts that long.
    - [x] When a group of pumpkins appears, then it contains at most three pumpkins standing directly next to each other, and a player who jumps once at the right moment clears the whole group.
    - [x] When the dinosaur passes a pumpkin with visible space between its body and the pumpkin, then the run continues (a near miss is still not a crash).
    - [x] When the first pumpkin of a run reaches the dinosaur, then it does so between 1.5 and 2.5 seconds after the run started, as the first cactus did.

### 2.2 Night sky with a moon and drifting clouds

- The sky is a dark navy night. A pale moon hangs in the sky and a few stars twinkle. Several clouds drift slowly across the sky from right to left, each at its own slow pace, and a cloud that leaves the left edge comes back in from the right. The sky never covers or hides the dinosaur, the ground or any obstacle.
  - **Acceptance Criteria:**
    - [x] When the page opens, then the game area shows a dark navy sky with a moon and at least three stars, and the ground, dinosaur and hint are clearly readable against it.
    - [x] When a run has been going for 10 seconds, then the clouds are in visibly different places than at the start of the run and none of them has jumped or vanished suddenly.
    - [x] Given a cloud has drifted fully past the left edge of the game area, when 10 more seconds pass, then clouds are still drifting across the sky, so the sky never runs empty.
    - [x] When the game-over screen is showing, then the clouds keep drifting and the dinosaur, obstacles and score stay frozen.
    - [x] When a cloud passes behind the dinosaur or an obstacle, then the dinosaur or obstacle is drawn in front of it and stays fully visible.

### 2.3 A night that changes the longer you survive

- The night gets darker and stranger as a run goes on. In the first seconds it is a dusky navy. By 30 seconds it is clearly darker, at 45 seconds many more stars have come out, and at 60 seconds pairs of eyes begin to glow and blink in the darkness of the sky. By 90 seconds the night reaches its darkest and stays there for the rest of the run. Whatever the night looks like, the dinosaur, the obstacles, the ground, the score and the hints stay easy to see.
  - **Acceptance Criteria:**
    - [x] When a run has lasted 30 seconds, then the sky is clearly darker than it was in the first 5 seconds of the same run.
    - [x] When a run has lasted 45 seconds, then there are visibly more stars in the sky than at the start of the run.
    - [x] When a run has lasted 60 seconds, then pairs of eyes glow and blink somewhere in the sky, and none is shown during the first 30 seconds of a run.
    - [x] When a run has lasted 90 seconds, then the night stops getting darker and looks the same for the rest of the run.
    - [x] When the night is at its darkest, then the dinosaur, pumpkins, bats, ground line and score are all still clearly readable against the sky.

### 2.4 Reactions to what the player does

- The game answers the player's actions with small spooky moments, so every jump, landing and crash has a response. A reaction never hides the dinosaur or an obstacle, never lasts longer than a fraction of a second, and never changes how the game plays.
  - On a jump, the moon gives a small bounce and a few orange sparks puff off the dinosaur's feet.
  - On a landing, the whole game area gives a small thump (a shake of at most 3 pixels that settles within a fifth of a second).
  - On a crash, the sky flashes briefly in the orange accent colour at low strength and the game area gives a stronger shake, then everything freezes on the crash as before.
  - On every milestone (each 100 points) the player gets a small treat: a burst of orange sparks near the score. On every fifth milestone (each 500 points) they get a small scare instead: a bat-shaped silhouette flits across the sky and a pair of eyes blinks open and shut.
  - **Acceptance Criteria:**
    - [x] When the dinosaur jumps, then the moon visibly bounces and sparks appear at its feet, and both are gone within half a second.
    - [x] When the dinosaur lands after a jump, then the game area shakes by no more than 3 pixels and is steady again within a fifth of a second.
    - [x] When the run ends in a crash, then the sky flashes briefly in orange at low strength and the game area shakes, and then the screen stays frozen on the crash.
    - [x] When the score reaches 100, 200, 300 or 400, then a burst of orange sparks appears near the score together with the existing score blink.
    - [x] When the score reaches 500, then a bat silhouette crosses the sky and a pair of eyes blinks, instead of the sparks.
    - [x] When any reaction is playing, then the dinosaur and every obstacle stay fully visible and the run plays exactly as it would without the reaction.
    - [x] When the sky flashes on a crash, then the flash never fills the game area with solid bright colour and lasts no longer than a fifth of a second.

### 2.5 One visual style: moonlit monochrome with one orange accent

- The whole edition uses a single look. The sky is dark navy. The dinosaur, ground, obstacles, text and everything else are in pale greys and off-white shades. Orange is the only other colour and is used in a few places only: the glow of pumpkin faces, the sparks and flashes of the reactions, candies, the band of the witch's hat, the hearts and the puddle on the game-over screen. No other hue appears anywhere.
  - **Acceptance Criteria:**
    - [x] When the page is open at any moment of the game, then every drawn element is either a shade of navy, a pale grey or off-white, or the single orange accent, and no other hue appears.
    - [x] When the run ends in a crash, then the puddle that spreads under the dinosaur is orange instead of red.
    - [x] When the page opens on a laptop screen at least 1024 pixels wide, then the game area is still 800 by 300 pixels, centred and visible without scrolling, and it still shrinks to fit smaller windows as in the core game.

### 2.6 Ducking

- While the dinosaur is on the ground during a run, the player can hold the DOWN arrow to duck. A ducking dinosaur lowers its body and is noticeably shorter. When the player lets go of the key, the dinosaur stands up again. Pressing SPACE or the UP arrow while ducking makes the dinosaur jump as usual. Pressing DOWN on the start screen, on the game-over screen, or while the dinosaur is in the air does nothing.
  - **Acceptance Criteria:**
    - [x] Given the dinosaur is running on the ground, when the player holds the DOWN arrow, then the dinosaur lowers into a visibly shorter ducking pose and stays ducked for as long as the key is held.
    - [x] Given the dinosaur is ducking, when the player lets go of the DOWN arrow, then the dinosaur stands up and keeps running.
    - [x] Given the dinosaur is ducking, when the player presses SPACE or the UP arrow, then the dinosaur jumps and lands back on the ground about 0.6 seconds later.
    - [x] Given the dinosaur is in the air, when the player presses the DOWN arrow, then nothing changes and the jump continues as before.
    - [x] Given the player is holding the DOWN arrow when the dinosaur lands, when it touches the ground, then it lands standing and the player must let go and press DOWN again to duck.
    - [x] When the player presses the DOWN arrow on the start screen or on the game-over screen, then nothing changes.
    - [x] Given the dinosaur is ducking, when the player switches to another browser tab and comes back, then the dinosaur is standing again and no key is treated as still held.

### 2.7 Bats

- Bats fly toward the dinosaur at head height. A standing or jumping dinosaur that meets a bat crashes into it; a ducking dinosaur passes safely underneath. Bats flap their wings so they read as flying. Bats arrive no earlier than 25 seconds into a run, so the first stretch of every run is the familiar pumpkin run, and they always leave the player enough room to react: a bat is never placed so close to a pumpkin that a player must duck and jump at nearly the same time.
  - **Acceptance Criteria:**
    - [x] When a run has lasted less than 25 seconds, then no bat has appeared.
    - [x] When a run has lasted 60 seconds without a crash, then at least one bat has appeared.
    - [x] When a bat reaches the dinosaur while the dinosaur is standing, then the run ends in a crash with the same game-over screen as hitting a pumpkin.
    - [x] When a bat reaches the dinosaur while the dinosaur is in the air, then the run ends in a crash.
    - [x] When a bat reaches the dinosaur while the dinosaur is ducking, then the bat passes over it and the run continues.
    - [x] When a bat passes the dinosaur with visible space between them, then the run continues (a near miss is not a crash).
    - [x] When a bat has moved fully past the left edge of the game area, then it is gone and does not reappear.
    - [x] When a bat and a pumpkin group are the next two obstacles, then the distance between them is never shorter than the distance the dinosaur covers during one full jump plus a reaction margin of half a second at the current pace.
    - [x] When two bats appear one after another, then the distance between them is never shorter than the distance covered in one second at the current pace.

### 2.8 The witch's hat

- Now and then a witch's hat floats in from the right at the height the top of a jump reaches. If the dinosaur touches it, the player catches it: the hat vanishes with a small spark burst, a "candy time" mark appears at the left of the game area for the rest of the run, and candies start to appear. At most one hat is in the game at a time, the first one comes no earlier than 30 seconds into a run, and after the hat has been caught, no more hats appear in that run. A hat that is not caught floats off the left edge and a new one comes later. A hat is never placed where catching it would force the player into a pumpkin or a bat. A hat is never dangerous and touching it never ends a run.
  - **Acceptance Criteria:**
    - [x] When a run has lasted less than 30 seconds, then no hat has appeared.
    - [x] Given a hat is floating toward the dinosaur, when the dinosaur touches it, then the hat disappears with a small burst of orange sparks and the "candy time" mark appears at the left of the game area.
    - [x] Given a hat is floating toward the dinosaur, when the dinosaur passes it without touching it, then the hat leaves the left edge of the game area, the run continues, and a later hat can appear.
    - [x] Given the hat has been caught in this run, when the run continues, then no further hat appears for the rest of that run.
    - [x] When the dinosaur touches a hat while ducking or standing on the ground, then nothing happens, because the hat floats at jump height and is only caught in the air.
    - [x] When a hat is on the screen, then no pumpkin or bat is close enough to it that catching the hat would make the next obstacle unavoidable.
    - [x] Given the player crashed and restarts, when the new run starts, then the "candy time" mark is gone and the hat has to be caught again.

### 2.9 Candies and hearts

- Once the hat has been caught, candies appear on the ground in the dinosaur's path at irregular intervals, roughly one every 4 to 8 seconds. Running into a candy eats it and gives the player a heart. The player can hold at most three hearts at once; eating a candy at full hearts does nothing extra. Hearts are shown in the orange accent colour in the top-left corner of the game area. Candies never block the way and are never dangerous. When the dinosaur hits a pumpkin or a bat while holding at least one heart, then the player loses one heart and the run goes on instead of ending. The dinosaur then blinks for 1.5 seconds and cannot crash during that time, so a single mistake cannot take two hearts at once. When the dinosaur hits an obstacle with no hearts, then the run ends as in the core game.
  - **Acceptance Criteria:**
    - [x] Given the hat has not been caught in this run, when the run continues, then no candy ever appears.
    - [x] Given the hat has been caught, when 10 seconds have passed, then at least one candy has appeared on the ground.
    - [x] Given the dinosaur has no hearts, when it eats a candy, then the candy disappears with a small spark burst and one heart appears at the top-left of the game area.
    - [x] Given the player holds three hearts, when the dinosaur eats a candy, then the candy disappears and the player still holds three hearts.
    - [x] Given the player holds at least one heart, when the dinosaur hits a pumpkin, then one heart is lost, the run continues, and the dinosaur blinks for 1.5 seconds.
    - [x] Given the player holds at least one heart, when the dinosaur hits a bat, then one heart is lost, the run continues, and the dinosaur blinks for 1.5 seconds.
    - [x] Given the dinosaur is blinking after losing a heart, when it touches another obstacle within the 1.5 seconds, then no heart is lost and the run continues.
    - [x] Given the dinosaur is blinking after losing a heart, when the 1.5 seconds are over and it hits another obstacle with hearts left, then another heart is lost and the run continues.
    - [x] Given the player has no hearts, when the dinosaur hits a pumpkin or a bat, then the run ends in a crash with the game-over screen.
    - [x] When a heart is lost, then the game area gives the same small shake as on a landing and the heart disappears from the top-left corner.
    - [x] When a run ends in a crash, then the best score is still saved exactly as in the core game, and hearts do not change the score in any way.

### 2.10 Restarting and replaying the same course

- A restart is a completely fresh run: nothing from the previous run is carried over except the best score. That includes the witch's hat, candy time, hearts, the darkness of the night, bats, candies and the reaction effects. A run started with a seed in the page address repeats the same course exactly, which now includes the same bats, the same hat and the same candies at the same moments.
  - **Acceptance Criteria:**
    - [x] Given the game-over screen is showing, when the player presses SPACE or the UP arrow, then a new run starts within half a second with the score at `00000`, the sky back to its dusky navy, no bats, hat, candies or hearts on screen, and the "candy time" mark gone.
    - [x] Given the page is opened with `?seed=` followed by a whole number, when two runs are played on that page and the player does the same things, then the pumpkins, bats, hat and candies appear at the same moments in both runs.
    - [x] When the page is opened with a different seed number, then the course (pumpkins, bats, hat and candies) differs from that of the first number.
    - [x] When a seed is used, then nothing else about the game changes: scoring, pace, controls and screens behave exactly as without it.
    - [x] When the player restarts ten times in a row, then the tenth run behaves exactly as the first (same starting pace, one jump per key press, same responsiveness).

### 2.11 The game stays fair and still feels like the original

- Everything added by this edition keeps the promise of the core game: every crash is the player's own mistake, and every situation can be survived by a player who reacts in time. Ducking is the only new control. The pace, jump height, jump length, scoring and high score work as in the core game.
  - **Acceptance Criteria:**
    - [x] When a run is in progress, then the score rises at the same rate as in the core game: about 10 points per second at the starting pace and faster as the pace increases.
    - [x] When a run has lasted 90 seconds, then the pace has reached about twice the starting pace and stops increasing, as in the core game.
    - [x] When a player who reacts well jumps over every pumpkin group and ducks under every bat, then they can play an entire 3-minute run on any seed without ever being forced into a crash.
    - [x] When the high score is shown, saved and restored, then it behaves exactly as in the core game.
    - [x] When the player presses any key other than SPACE, the UP arrow or the DOWN arrow on the start screen, during a run or on the game-over screen, then nothing changes.

---

## 3. Scope and Boundaries

### In-Scope

- Pumpkins, in two sizes, replacing the cacti, with the same sizes, groups and fair gaps.
- A navy night sky with a moon, stars and drifting clouds.
- A night that gets darker and stranger with survival time, in stages up to 90 seconds.
- Small reactions to jumping, landing, crashing and reaching a milestone (a treat every 100 points, a scare every 500 points).
- One visual style: moonlit monochrome plus a single orange accent.
- Ducking with the DOWN arrow and bats that are cleared by ducking.
- The witch's hat, candies and up to three hearts that soften crashes.
- A restart that resets everything new, and a seed that replays the same course including bats, hat and candies.
- Automated tests for all new rules.

### Out-of-Scope

- Sound and music.
- New dinosaur art beyond a ducking pose (and a blinking effect while protected).
- Difficulty settings or any way to change the rules.
- Keeping the hat, hearts or candy time between runs or between visits. Only the best score is remembered.
- Touch or mobile controls for ducking, and any other new controls.
- More new obstacles, collectibles or power-ups than the bats, hat, candies and hearts named here.
- Extra points for candies or any other change to how the score works.
- A day or season switch: the Halloween edition does not return to the plain look and is not tied to a date.
- Online leaderboards, accounts, sharing and multiplayer.

### Decisions the brief left open

Marketing's brief did not settle the following points. Each one is decided here so that nobody has to guess.

| Question left open by the brief | Decision in this specification |
| --- | --- |
| What does ducking do and which key does it use? | Hold the DOWN arrow on the ground; the dinosaur is shorter while held; jump still works while ducked; DOWN does nothing in the air, on the start screen or on the game-over screen. |
| Does the hat survive a restart? | No. A restart is a fresh run and only the best score is remembered. |
| How high do bats fly? | At head height, so that standing or jumping meets them and only ducking passes under. |
| When do bats first appear, and can they come right after a pumpkin? | Not before 25 seconds; always with a safe distance from pumpkins and from each other. |
| Where is the hat and how is it caught? | It floats at jump height and is caught only in the air, never forced on the player. |
| When does the first hat appear, and how many per run? | Not before 30 seconds; one at a time; none once caught in that run. |
| How often do candies appear? | About one every 4 to 8 seconds after the hat is caught. |
| How many hearts can be held and what does a crash cost? | At most three; a crash with a heart costs one heart, then 1.5 seconds of protection. |
| Do hearts or candies change the score? | No. |
| What does "darker and stranger" mean? | Darker by 30 seconds, more stars at 45, glowing eyes at 60, darkest at 90 seconds. |
| What is a "small treat" and a "small scare" at a milestone? | A treat (orange sparks) every 100 points; a scare (bat silhouette and blinking eyes) every 500 points. |
| What happens to the red puddle? | It becomes orange, the single accent colour. |
| Which look is used? | One look only: moonlit monochrome with a single orange accent. |
| What happens to the parts of the core game that said "no ducking, no lives, no clouds"? | This edition replaces them for the Halloween edition. |

---

## Verification

_Verified 2026-10-31 by `/awos:verify`. All 69 acceptance criteria are marked `[x]`. Evidence by kind:_

- **Rendered in a real browser** (Playwright on the Vite dev server, deterministic stepping, seeds 7, 8 and 42): the screenshots in `docs/screenshots/002-halloween-edition-*.png` show the start screen, pumpkins, clouds at the start and after 10 s, the night at 30, 45, 60 and 90 s, jump sparks, the crash flash and orange puddle, game over, the duck pose, a bat near the dino, the hat, the candy-time mark, three hearts, the heart-lost blink, the 100 and 500 milestones and a clean restart. The user confirmed the look matches the spec (moonlit navy, pale grey, one orange accent, readable).
- **Measured in the browser:** first pumpkin reaches the dino at 2.28 s; ArrowDown does nothing on the start and game-over screens; duck is 30 px tall with a 24 px hitbox; a jump from a duck lands in about 0.58 s; ArrowDown in the air changes nothing; a key held across a landing lands standing; blur and tab-hidden return the dino to standing; other keys do nothing; the same seed gives identical bat, hat and candy ticks on two runs and a different seed differs; the canvas is 800 by 300, centred, with no scroll at 1280 by 720 and shrinks to fit at 600 by 400; the score is 105 at tick 600.
- **Proven by tests** (suite: 520 passed, 1 failed, the known Windows-only `tests/hooks/block-secrets.test.ts` path-separator failure, which passes on Linux CI): timing and fairness rules for bats, the hat, candies and hearts, restart and seed replay, the 3-minute no-forced-crash runs, palette-only drawing, and the reaction and night-stage thresholds. The criterion-by-criterion table is in the slice 6 report and `tests/halloween.acceptance.test.ts`.
- **Caveat on 2.5 (palette):** pixel sampling found no off-palette hue in normal frames except a few dozen dark-brown pixels, which are orange blended with navy. On the crash frame the spec's low-strength orange flash is drawn over the navy sky, so the sampled colour is a dark red-brown (about rgb 82, 51, 49). That is the blend of the allowed orange at the specified low strength, not an extra colour in `PALETTE`, and the user accepted the look.

## Change Log

_Dated amendments made after the spec was first written — typically by `/awos:spec` in Update Mode when a bug fix changed documented behavior. Each entry records the date, the source reference (bug id or fix description), and what behavior changed and why. Leave empty until the first amendment._

- **2026-10-30 — Spec created from the marketing brief.** First version of the Halloween edition, scoped to all three layers (night, bats, witch's hat). It replaces the core game's limits on a plain look, ducking, flying obstacles, lives and power-ups for this edition only.
- **2026-10-31 — Verified.** All acceptance criteria confirmed by `/awos:verify`; Status set to Completed.
