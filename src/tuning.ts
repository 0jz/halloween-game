// Every number the spec quotes, and every layout number, as named exports.
// The export names are part of the frozen contract (architecture section 3);
// the values may be retuned. Source: technical considerations 2.3.

/** Fixed simulation timestep, in seconds. */
export const STEP_SECONDS = 1 / 60;

/** Fixed simulation timestep, in milliseconds (used by the frame accumulator). */
export const STEP_MS = 1000 / 60;

/** Logical canvas size; all drawing uses these coordinates. */
export const CANVAS = { width: 800, height: 300 } as const;

/**
 * The Halloween look (spec 002, technical considerations 2.1): dusk navy
 * background, pale grey foreground, one orange accent, plus mid grey-blue for
 * clouds and stars, an off-white moon and a near-black navy night overlay.
 */
export const PALETTE = {
  bg: '#1a1c3a',
  fg: '#d0d3e0',
  accent: '#ff7a1a',
  dim: '#5a6088',
  moon: '#f2efe2',
  skyDark: '#05060f',
} as const;

/** Night sky milestones, in running ticks (60 per second). Spec 002, 2.2. */
export const NIGHT_DARKER_TICK = 1800;
export const NIGHT_STARS_TICK = 2700;
export const NIGHT_EYES_TICK = 3600;
/** The sky is fully dark here (90 s). */
export const NIGHT_DARKEST_TICK = 5400;

/** Stars shown once NIGHT_STARS_TICK passes: STARS_BASE, growing by up to STARS_EXTRA. */
export const STARS_BASE = 12;
export const STARS_EXTRA = 24;

/** Overlay opacity at full night. */
export const NIGHT_MAX_ALPHA = 0.6;

/** Clouds drifting in the sky. */
export const CLOUD_COUNT = 4;

/** Pairs of glowing eyes in the dark. */
export const EYES_PAIRS = 3;

/** Salts for feature-owned visual Rngs: `createRng((seed ^ SALT) >>> 0)`. */
export const NIGHT_SALT = 0x5eed5eed;
export const REACTION_SALT = 0xfa11fa11;

/** Screen shake peak offsets, in logical px, and their lengths in render frames. */
export const SHAKE_LAND_PX = 3;
export const SHAKE_DIE_PX = 6;
export const SHAKE_LAND_FRAMES = 12;
export const SHAKE_DIE_FRAMES = 18;

/** Death flash: peak opacity and length in render frames. */
export const FLASH_ALPHA = 0.25;
export const FLASH_FRAMES = 10;

/**
 * The game-over puddle (functional spec 2.5): full width in logical px, and how
 * many render frames it takes to spread (30 frames is about 0.5 s at 60 Hz).
 */
export const PUDDLE = { width: 60, growFrames: 30 } as const;

/**
 * Bats (spec 002, technical considerations 2.5). Own Rng stream via BAT_SALT;
 * the first bat is drawn in [BAT_FIRST_TICK, BAT_FIRST_TICK_MAX] (25 to 35 s),
 * then every BAT_INTERVAL_TICKS (inclusive). The hitbox top sits
 * BAT_HITBOX_TOP_ABOVE_GROUND px above the ground.
 */
export const BAT_SALT = 0xba7ba7;
export const BAT_FIRST_TICK = 1500;
export const BAT_FIRST_TICK_MAX = 2100;
export const BAT_INTERVAL_TICKS = [480, 900] as const;
export const BAT_HITBOX_TOP_ABOVE_GROUND = 85;
export const BAT_HITBOX_HEIGHT = 52;
/** The wing frame toggles every this many ticks. */
export const BAT_FLAP_TICKS = 8;
/** Minimum ticks between two bat placements. */
export const BAT_TO_BAT_TICKS = 300;

/**
 * Witch's hat, candies and hearts (spec 002, technical considerations 2.6).
 * Own Rng streams via HAT_SALT and CANDY_SALT. The hat floats at jump height
 * (its top is HAT_TOP_ABOVE_GROUND px above the ground) so only an airborne
 * dino reaches it; the first hat comes at HAT_FIRST_TICK (30 s), later ones
 * after HAT_RESPAWN_TICKS (inclusive). Candies come every CANDY_INTERVAL_TICKS
 * (inclusive) once candy time is on. HAT_CLEAR_TICKS and CANDY_CLEAR_PX keep
 * them away from obstacles and bats.
 */
export const HAT_SALT = 0x4a7c0de;
export const HAT_FIRST_TICK = 1800;
export const HAT_RESPAWN_TICKS = [900, 1500] as const;
export const HAT_TOP_ABOVE_GROUND = 110;
export const HAT_CLEAR_TICKS = 60;
export const CANDY_SALT = 0xca9d1e5;
export const CANDY_INTERVAL_TICKS = [240, 480] as const;
export const CANDY_CLEAR_PX = 80;
/** Most hearts the player can hold. */
export const MAX_HEARTS = 3;
/** Protection after losing a heart: 1.5 s of ticks. */
export const INVULN_TICKS = 90;
/** The dino alternates hidden and visible in blocks of this many ticks while protected. */
export const INVULN_BLINK_TICKS = 5;

/** Top of the ground line, in logical px. */
export const GROUND_Y = 260;

/** Horizontal position of the dinosaur, in logical px. */
export const DINO_X = 50;

/** Starting pace, in px per step. */
export const START_SPEED = 6;

/** Maximum pace, in px per step (2x the starting pace). */
export const MAX_SPEED = 12;

/** Running tick at which the pace reaches MAX_SPEED (90 s). */
export const MAX_SPEED_AT_TICK = 5400;

/** Ticks from take-off to landing (0.6 s). */
export const JUMP_DURATION_TICKS = 36;

/** Peak jump height, in logical px; gravity and impulse derive from it and the duration. */
export const JUMP_HEIGHT_PX = 70;

/** Inclusive tick range in which the first obstacle reaches the dinosaur (1.5 to 2.5 s). */
export const FIRST_ARRIVAL_TICKS = [90, 150] as const;

/** Reaction time the minimum gap allows for, in ticks (0.5 s). */
export const REACTION_TICKS = 30;

/**
 * Minimum gap factor, in ticks: the minimum gap between groups is
 * `speed * MIN_GAP_FACTOR` px, i.e. `speed * (JUMP_DURATION_TICKS + REACTION_TICKS)`.
 * Use `minGapPx(speed)` for the gap itself.
 */
export const MIN_GAP_FACTOR = JUMP_DURATION_TICKS + REACTION_TICKS;

/** Minimum gap between obstacle groups at the given speed, in px. */
export function minGapPx(speed: number): number {
  return speed * MIN_GAP_FACTOR;
}

/** The maximum gap is this many times the minimum gap. */
export const MAX_GAP_FACTOR = 2.5;

/** Largest number of cacti in one group. */
export const MAX_GROUP_SIZE = 3;

/** Chance that a spawned cactus is large rather than small. Assumption. */
export const LARGE_CACTUS_PROBABILITY = 0.35;

/**
 * Index of the group that is forced to the kind a run has not shown yet
 * (0 is the first group). Groups are at most about 174 ticks apart, so group 3
 * spawns well before tick 1200 and both sizes appear within 20 s (functional
 * spec 2.3). Not a spec number; a design guarantee.
 */
export const MISSING_KIND_FORCED_AT_GROUP = 3;

/** Points per second at START_SPEED; per tick: SCORE_PER_SECOND / 60 * speed / START_SPEED. */
export const SCORE_PER_SECOND = 10;

/** The score is capped here (five digits). */
export const MAX_SCORE = 99999;

/** A milestone is every multiple of this many points. */
export const MILESTONE_EVERY = 100;

/** The run-cycle frame toggles every this many ticks while running on the ground. */
export const RUN_FRAME_TICKS = 6;

/**
 * Score blink after a milestone: inclusive [from, to] ranges of ticks since the
 * milestone during which the score is hidden.
 */
export const BLINK_SCHEDULE = [
  [0, 9],
  [20, 29],
  [40, 49],
] as const;

/** Longest elapsed time one browser frame may feed the accumulator, in ms. */
export const FRAME_CLAMP_MS = 100;

/** Largest accepted seed (uint32). */
export const MAX_SEED = 2 ** 32 - 1;

/**
 * HUD layout, in logical px. Text is aligned to fixed anchors so font metrics
 * that differ by operating system do not move it. `DrawContext` has no
 * `measureText`, so the HI block is placed from `charWidth`, a fixed
 * per-character advance for the monospace HUD font (0.6 em of 16 px, rounded up).
 */
export const HUD = {
  /** Right edge every top-right HUD text is right-aligned to. */
  right: CANVAS.width - 10,
  /** Vertical middle of the top-right HUD line (score and HI). */
  top: 20,
  /** Horizontal centre of the hint and "GAME OVER". */
  centreX: CANVAS.width / 2,
  /** Vertical middle of the hint. */
  hintY: CANVAS.height / 2,
  /** Vertical middle of "GAME OVER", above the hint. */
  gameOverY: CANVAS.height / 2 - 40,
  /** Assumed advance of one HUD-font character. */
  charWidth: 10,
  /** Space between the end of the HI value and the start of the score. */
  hiGap: 20,
  /** Top-left corner of the first heart. */
  heartsX: 10,
  heartsY: 10,
  /** Space between two hearts. */
  heartGap: 4,
  /** Left edge and vertical middle of the "candy time" mark under the hearts. */
  candyMarkX: 10,
  candyMarkY: 36,
} as const;

/** The mark shown under the hearts while candy time is on. */
export const CANDY_TIME_TEXT = 'candy time';
export const CANDY_TIME_FONT = '10px monospace';
