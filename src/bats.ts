// Bat timing, placement and movement as pure functions over plain data and a
// uint32 rng state (technical considerations 2.5). The bat stream is separate
// from the game's, so pumpkin draws never change. Pure: no DOM, no clock, no
// Math.random. `game.ts` (task 4.5) keeps the state in its run state.

import { nextRandom } from './rng.js';
import { laterSpeedBound, trailingEdge } from './obstacles.js';
import type { Drawn } from './obstacles.js';
import { Sprites } from './sprites.js';
import {
  BAT_FIRST_TICK,
  BAT_FIRST_TICK_MAX,
  BAT_FLAP_TICKS,
  BAT_HITBOX_TOP_ABOVE_GROUND,
  BAT_INTERVAL_TICKS,
  BAT_SALT,
  BAT_TO_BAT_TICKS,
  CANVAS,
  GROUND_Y,
  minGapPx,
} from './tuning.js';
import type { Bat, Obstacle } from './types.js';

/** The bat stream's starting uint32 state for a run seed. */
export function batRngStart(seed: number): number {
  return (seed ^ BAT_SALT) >>> 0;
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

/** The tick of the first bat, drawn once at run start. */
export function firstBatTick(rngState: number): Drawn<number> {
  return drawInclusive(rngState, BAT_FIRST_TICK, BAT_FIRST_TICK_MAX);
}

/** Ticks from one bat placement to the next attempt, in BAT_INTERVAL_TICKS. */
export function nextBatInterval(rngState: number): Drawn<number> {
  return drawInclusive(rngState, BAT_INTERVAL_TICKS[0], BAT_INTERVAL_TICKS[1]);
}

/** The wing frame on running tick `tick`: toggles every BAT_FLAP_TICKS. */
export function batWing(tick: number): 0 | 1 {
  return Math.floor(tick / BAT_FLAP_TICKS) % 2 === 0 ? 0 : 1;
}

/** A bat whose left edge is `x`, flying at the fixed bat height. */
export function makeBat(id: number, x: number, tick: number): Bat {
  const sprite = Sprites.bat0;
  const y = GROUND_Y - BAT_HITBOX_TOP_ABOVE_GROUND - sprite.hitbox.y;
  return {
    id,
    wing: batWing(tick),
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

/**
 * The room from the trailing edge of every obstacle to the right edge of the
 * canvas; unbounded when there is no obstacle.
 */
export function freeSpaceAtRightEdge(obstacles: readonly Obstacle[]): number {
  if (obstacles.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return CANVAS.width - trailingEdge(obstacles);
}

/** The gap a bat needs on both sides, at the pace it could spawn at. */
export function batGapPx(tick: number, speed: number): number {
  const bat = makeBat(0, CANVAS.width, tick);
  return minGapPx(laterSpeedBound(tick, speed, bat.x + bat.width));
}

export interface BatPlacementRequest {
  readonly tick: number;
  readonly speed: number;
  readonly obstacles: readonly Obstacle[];
  /** The tick of the last placed bat; `undefined` before the first. */
  readonly lastBatTick?: number | undefined;
}

/**
 * True when a bat due now may be placed: at least BAT_TO_BAT_TICKS after the
 * previous bat, and the free space at the right edge is at least the minimum
 * gap. Otherwise the caller retries next tick.
 */
export function canPlaceBat(request: BatPlacementRequest): boolean {
  if (
    request.lastBatTick !== undefined &&
    request.tick - request.lastBatTick < BAT_TO_BAT_TICKS
  ) {
    return false;
  }
  return (
    freeSpaceAtRightEdge(request.obstacles) >=
    batGapPx(request.tick, request.speed)
  );
}

/**
 * Raises the planned next pumpkin x to at least the bat's right edge plus the
 * minimum gap, so a pumpkin never spawns on or too near a bat. Only ever
 * widens; never lowers `nextSpawnX`, so pumpkin draws are unchanged.
 */
export function widenSpawnX(
  nextSpawnX: number,
  bat: Bat,
  tick: number,
  speed: number,
): number {
  return Math.max(nextSpawnX, bat.x + bat.width + batGapPx(tick, speed));
}

/** Moves every bat left by `speed` and drops those fully past the left edge. */
export function advanceBats(
  bats: readonly Bat[],
  speed: number,
  tick: number,
): readonly Bat[] {
  const moved: Bat[] = [];
  for (const bat of bats) {
    const x = bat.x - speed;
    if (x + bat.width < 0) {
      continue;
    }
    moved.push({
      ...bat,
      x,
      wing: batWing(tick),
      hitbox: { ...bat.hitbox, x: bat.hitbox.x - speed },
    });
  }
  return moved;
}
