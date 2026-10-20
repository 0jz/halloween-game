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
 * The look: near-white background, dark grey foreground, and one red accent
 * used only for the game-over puddle (functional spec 2.9).
 */
export const PALETTE = {
  bg: '#f7f7f7',
  fg: '#535353',
  accent: '#c4302b',
} as const;

/**
 * The game-over puddle (functional spec 2.5): full width in logical px, and how
 * many render frames it takes to spread (30 frames is about 0.5 s at 60 Hz).
 */
export const PUDDLE = { width: 60, growFrames: 30 } as const;

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
} as const;
