# Product Definition: Codeference Dino Runner

- **Version:** 1.0
- **Status:** Approved

---

## 1. The Big Picture (The "Why")

### 1.1. Project Vision & Purpose

A faithful, instantly playable browser version of the classic "no internet" dinosaur runner: open a page, press space, and have fun for one minute with zero setup. The game is complete and polished enough to be enjoyable on its own, and small and clear enough that someone seeing the code for the first time can understand how it works in a single sitting.

### 1.2. Target Audience

- **Players:** anyone with a laptop and thirty seconds to kill. No sign-up, no install, no instructions beyond "press space".
- **Learners:** engineering students and junior developers using this codebase as a practice ground for working with AI coding agents and spec-driven development. They need a product that works on day one, so their time goes into improving it, not fixing it.

### 1.3. User Personas

- **Persona 1: "Mila the Player"**
  - **Role:** Second-year computer science student, waiting for a lecture to start.
  - **Goal:** Beat her own high score before the professor arrives.
  - **Frustration:** Games that need an account, a download, or a tutorial before the first jump.

- **Persona 2: "Nikola the Learner"**
  - **Role:** Workshop participant seeing this repository for the first time.
  - **Goal:** Understand the whole game in twenty minutes, then confidently add something new to it.
  - **Frustration:** Codebases where "small" still means ten frameworks, a build pipeline nobody explains, and logic tangled with drawing code.

### 1.4. Success Metrics

- A new player starts their first run within 5 seconds of the page loading, with no instructions beyond the on-screen hint.
- A typical first session lasts at least one minute and includes at least three runs, which means the restart loop is fast and the game is fun enough to retry.
- A learner can locate where jumping, obstacles, collisions and scoring live within 10 minutes of opening the repository, without asking for help.
- The game behaves identically on every run when asked to, so that what a learner sees can be reproduced by a test.

---

## 2. The Product Experience (The "What")

### 2.1. Core Features

- **Run and jump:** the dinosaur runs automatically; the player jumps over cacti with space or the up arrow.
- **Obstacles that get harder:** cacti of varying sizes appear at varying gaps, and the game gradually speeds up the longer the player survives.
- **Score and high score:** the score climbs with distance; the best score is remembered between visits in the same browser.
- **Game over and instant restart:** colliding with an obstacle ends the run with a clear game-over screen; one key press starts a fresh run.
- **Reproducible runs:** the game can be started in a mode where the sequence of obstacles is fixed, so a run can be replayed exactly. _(Assumption: needed so learners and automated checks can reason about the game deterministically.)_

### 2.2. User Journey

A player opens the page and sees the dinosaur standing on the ground with a short hint: "Press space to start". They press space; the dinosaur starts running and the first cactus approaches. They jump, land, jump again, and watch the score climb in the corner as the pace quietly increases. Eventually they mistime a jump and hit a cactus: the game freezes on the collision, shows "Game over", their score, and their best score so far. They press space again and are immediately back at the start of a new run, trying to beat it.

---

## 3. Project Boundaries

### 3.1. What's In-Scope for this Version

- A single-player, keyboard-controlled runner playable in a modern desktop browser.
- Dinosaur run and jump, ground, cacti obstacles of at least two sizes, collision detection.
- Gradual speed increase during a run; full reset of speed and obstacles on restart.
- Score display during the run; high score persisted in the browser.
- Start screen hint, game-over screen with score and high score, one-key restart.
- Simple, readable pixel-style visuals in a single consistent palette.
- A reproducible mode where the obstacle sequence is fixed for a given run.
- Automated tests for the game rules (jumping, obstacles, collisions, scoring, restart).

### 3.2. What's Out-of-Scope (Non-Goals)

- Visual richness: parallax backgrounds, day/night cycles, particle effects, animations beyond the basic run cycle. _This is the natural next version: "make it shine"._
- Sound and music.
- Flying obstacles and ducking.
- Power-ups, lives, or difficulty settings.
- Mobile or touch controls; responsive layout beyond "fits a laptop screen".
- Online leaderboards, accounts, or sharing scores.
- Multiplayer in any form.
- Localisation.
