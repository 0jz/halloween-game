// Witch's hat, candies, hearts and the protection blink as pure functions over
// plain data and uint32 rng states (technical considerations 2.6). The hat and
// candy streams are separate from the game's, so pumpkin draws never change.
// Pure: no DOM, no clock, no Math.random. `game.ts` (task 5.4) keeps the state.
//
// Hat height. The hat's hitbox spans HAT_TOP_ABOVE_GROUND (110) down to 84 px
// above the ground. A standing dino reaches 45 px and a ducking one less, so
// neither touches it; a jump peaks at JUMP_HEIGHT_PX = 70, lifting the dino's
// hitbox top to about 113, so any jump of more than roughly 40 px touches it.
// It is therefore catchable only by jumping, always reachable by a normal
// jump, and it sits above the bat's lowest point only by 1 px, so the clearance
// rules (not the height) keep it away from bats.

import { nextRandom } from './rng.js';
import { trailingEdge } from './obstacles.js';
import type { Drawn } from './obstacles.js';
import { Sprites } from './sprites.js';
import {
  CANDY_CLEAR_PX,
  CANDY_INTERVAL_TICKS,
  CANDY_SALT,
  CANVAS,
  GROUND_Y,
  HAT_CLEAR_TICKS,
  HAT_FIRST_TICK,
  HAT_RESPAWN_TICKS,
  HAT_SALT,
  HAT_TOP_ABOVE_GROUND,
  INVULN_BLINK_TICKS,
  INVULN_TICKS,
  MAX_HEARTS,
} from './tuning.js';
import type { Bat, Candy, Hat, Obstacle } from './types.js';

/** The hat stream's starting uint32 state for a run seed. */
export function hatRngStart(seed: number): number {
  return (seed ^ HAT_SALT) >>> 0;
}

/** The candy stream's starting uint32 state for a run seed. */
export function candyRngStart(seed: number): number {
  return (seed ^ CANDY_SALT) >>> 0;
}

/** A uniform integer in the inclusive [from, to], with the advanced state. */
function drawInclusive(
  rngState: number,
  from: number,
  to: number,
): Drawn<number> {
  const [u, next] = nextRandom(rngState);
  return [from + Math.floor(u * (to - from + 1)), next];
}

/** The tick of the first hat: fixed, no draw. */
export function firstHatTick(): number {
  return HAT_FIRST_TICK;
}

/** Ticks until the next hat after one has left the screen uncaught. */
export function nextHatDelay(rngState: number): Drawn<number> {
  return drawInclusive(rngState, HAT_RESPAWN_TICKS[0], HAT_RESPAWN_TICKS[1]);
}

/** Ticks until the next candy, in CANDY_INTERVAL_TICKS (inclusive). */
export function nextCandyInterval(rngState: number): Drawn<number> {
  return drawInclusive(
    rngState,
    CANDY_INTERVAL_TICKS[0],
    CANDY_INTERVAL_TICKS[1],
  );
}

/** A hat whose left edge is `x`, floating at jump height. */
export function makeHat(x: number): Hat {
  const sprite = Sprites.hat;
  const y = GROUND_Y - HAT_TOP_ABOVE_GROUND - sprite.hitbox.y;
  return {
    x,
    y,
    width: sprite.width,
    height: sprite.height,
    hitbox: {
      x: x + sprite.hitbox.x,
      y: y + sprite.hitbox.y,
      width: sprite.hitbox.width,
      height: sprite.hitbox.height,
    },
  };
}

/** A candy lying on the ground with its left edge at `x`. */
export function makeCandy(id: number, x: number): Candy {
  const sprite = Sprites.candy;
  const y = GROUND_Y - sprite.height;
  return {
    id,
    x,
    y,
    width: sprite.width,
    height: sprite.height,
    hitbox: {
      x: x + sprite.hitbox.x,
      y: y + sprite.hitbox.y,
      width: sprite.hitbox.width,
      height: sprite.hitbox.height,
    },
  };
}

/** The horizontal clearance a hat keeps from obstacles and bats, in px. */
export function hatClearPx(speed: number): number {
  return HAT_CLEAR_TICKS * speed;
}

/** The right edge of every pumpkin and bat; negative infinity when none. */
function trailingEdgeOfAll(
  obstacles: readonly Obstacle[],
  bats: readonly Bat[],
): number {
  let edge = trailingEdge(obstacles);
  for (const bat of bats) {
    edge = Math.max(edge, bat.x + bat.width);
  }
  return edge;
}

export interface HatPlacementRequest {
  readonly tick: number;
  readonly speed: number;
  readonly obstacles: readonly Obstacle[];
  readonly bats: readonly Bat[];
  /** The tick the hat is due (first or after a respawn delay). */
  readonly dueTick: number;
  /** True once the hat was caught this run: none ever follows. */
  readonly caught: boolean;
  /** True while a hat is already on the screen. */
  readonly hatOnScreen: boolean;
}

/**
 * True when a hat due now may be placed at the right edge: not caught yet, none
 * on screen, the due tick reached (never before HAT_FIRST_TICK), and every
 * pumpkin and bat ends at least `hatClearPx(speed)` before the right edge, so
 * catching it never leaves an unavoidable obstacle. Otherwise retry next tick.
 */
export function canPlaceHat(request: HatPlacementRequest): boolean {
  if (request.caught || request.hatOnScreen) {
    return false;
  }
  if (request.tick < Math.max(request.dueTick, HAT_FIRST_TICK)) {
    return false;
  }
  return (
    CANVAS.width - trailingEdgeOfAll(request.obstacles, request.bats) >=
    hatClearPx(request.speed)
  );
}

/**
 * Raises the planned next pumpkin x to at least the hat's right edge plus the
 * hat clearance, so no pumpkin spawns close behind a hat. Only ever widens.
 */
export function widenSpawnXForHat(
  nextSpawnX: number,
  hat: Hat,
  speed: number,
): number {
  return Math.max(nextSpawnX, hat.x + hat.width + hatClearPx(speed));
}

/**
 * True when a bat or pumpkin may spawn at the right edge as far as the hat is
 * concerned: no hat, or the hat's right edge is already hatClearPx(speed) in.
 */
export function hatAllowsSpawn(hat: Hat | null, speed: number): boolean {
  return hat === null || hat.x + hat.width + hatClearPx(speed) <= CANVAS.width;
}

export interface CandyPlacementRequest {
  readonly candyTime: boolean;
  readonly obstacles: readonly Obstacle[];
  readonly bats: readonly Bat[];
}

/**
 * True when a candy due now may be placed at the right edge: only in candy
 * time, and every pumpkin and bat ends at least CANDY_CLEAR_PX before the right
 * edge. Otherwise the caller retries next tick.
 */
export function canPlaceCandy(request: CandyPlacementRequest): boolean {
  if (!request.candyTime) {
    return false;
  }
  return (
    CANVAS.width - trailingEdgeOfAll(request.obstacles, request.bats) >=
    CANDY_CLEAR_PX
  );
}

/**
 * Raises the planned next pumpkin x to at least the candy's right edge plus
 * CANDY_CLEAR_PX, so no pumpkin spawns on a candy. Only ever widens.
 */
export function widenSpawnXForCandy(nextSpawnX: number, candy: Candy): number {
  return Math.max(nextSpawnX, candy.x + candy.width + CANDY_CLEAR_PX);
}

/** Moves the hat left by `speed`; null once fully past the left edge. */
export function advanceHat(hat: Hat | null, speed: number): Hat | null {
  if (hat === null) {
    return null;
  }
  const x = hat.x - speed;
  if (x + hat.width < 0) {
    return null;
  }
  return { ...hat, x, hitbox: { ...hat.hitbox, x: hat.hitbox.x - speed } };
}

/** Moves every candy left by `speed` and drops those fully past the left edge. */
export function advanceCandies(
  candies: readonly Candy[],
  speed: number,
): readonly Candy[] {
  const moved: Candy[] = [];
  for (const candy of candies) {
    const x = candy.x - speed;
    if (x + candy.width < 0) {
      continue;
    }
    moved.push({
      ...candy,
      x,
      hitbox: { ...candy.hitbox, x: candy.hitbox.x - speed },
    });
  }
  return moved;
}

/** Hearts after eating a candy: one more, never above MAX_HEARTS. */
export function gainHeart(hearts: number): number {
  return Math.min(MAX_HEARTS, hearts + 1);
}

/** Hearts after a hit: one fewer, never below zero. */
export function loseHeart(hearts: number): number {
  return Math.max(0, hearts - 1);
}

/** The protection length set when a heart is lost. */
export function startProtection(): number {
  return INVULN_TICKS;
}

/** One running step of protection countdown; never below zero. */
export function tickProtection(invulnTicks: number): number {
  return Math.max(0, invulnTicks - 1);
}

/** True while a hit must be ignored. */
export function isProtected(invulnTicks: number): boolean {
  return invulnTicks > 0;
}

/**
 * Blink visibility of the dino: always visible with no protection; otherwise
 * hidden on the first INVULN_BLINK_TICKS after the hit, then alternating.
 */
export function dinoVisible(invulnTicks: number): boolean {
  if (invulnTicks <= 0) {
    return true;
  }
  const elapsed = INVULN_TICKS - invulnTicks;
  return Math.floor(elapsed / INVULN_BLINK_TICKS) % 2 === 1;
}
