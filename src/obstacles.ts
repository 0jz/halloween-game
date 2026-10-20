// Obstacle spawning and movement as pure functions over plain data and the
// run's uint32 rng state (technical considerations 2.2 obstacles row, 2.4
// steps 6 and 7). Pure: no DOM, no clock, no Math.random.
//
// Spawn model. `nextSpawnX` is the planned left edge of the next group, in
// screen px, and it scrolls with the world exactly like an obstacle. When it
// reaches the right edge (`<= CANVAS.width`) the group is placed there, and the
// following target becomes this group's trailing edge plus a fresh gap. Because
// target and obstacles move by the same `speed`, the gap drawn at spawn time is
// the gap the player sees, and gaps measured in px scale with the pace.

import { nextRandom } from './rng.js';
import { Sprites, obstacleSprite } from './sprites.js';
import {
  CANVAS,
  DINO_X,
  FIRST_ARRIVAL_TICKS,
  GROUND_Y,
  LARGE_CACTUS_PROBABILITY,
  MAX_GAP_FACTOR,
  MAX_GROUP_SIZE,
  MAX_SPEED_AT_TICK,
  MISSING_KIND_FORCED_AT_GROUP,
  START_SPEED,
  minGapPx,
} from './tuning.js';
import type { Obstacle, ObstacleKind } from './types.js';

/**
 * The pace on running tick `tick`, in px per step (technical considerations
 * 2.3): linear from START_SPEED at tick 0 to MAX_SPEED (2x) at
 * MAX_SPEED_AT_TICK, then constant.
 */
export function speedAt(tick: number): number {
  return (
    START_SPEED * (1 + Math.min(tick, MAX_SPEED_AT_TICK) / MAX_SPEED_AT_TICK)
  );
}

/** A value drawn from the rng together with the advanced rng state. */
export type Drawn<T> = readonly [value: T, rngState: number];

/**
 * The x an obstacle's hitbox must reach to touch the dinosaur: the right edge
 * of the dino's hitbox (architecture section 3, "Reaching the dinosaur").
 */
export const DINO_REACH_X =
  DINO_X + Sprites.dinoStand.hitbox.x + Sprites.dinoStand.hitbox.width;

/** One obstacle of `kind` standing on the ground at `x`, with an absolute hitbox. */
export function makeObstacle(
  kind: ObstacleKind,
  x: number,
  id: number,
  group: number,
): Obstacle {
  const sprite = obstacleSprite(kind);
  const y = GROUND_Y - sprite.height;
  return {
    id,
    group,
    kind,
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

export interface GroupRequest {
  readonly rngState: number;
  /** Left edge of the group's first obstacle. */
  readonly x: number;
  /** Id of the group's first obstacle; the rest follow consecutively. */
  readonly nextId: number;
  readonly group: number;
  /** A kind the group must have (the both-kinds guarantee); `undefined` for none. */
  readonly forcedKind?: ObstacleKind | undefined;
}

/**
 * A group of 1 to MAX_GROUP_SIZE obstacles standing directly next to each
 * other, sharing one `group`. Always takes exactly two draws: the first picks
 * a single large cactus with LARGE_CACTUS_PROBABILITY, otherwise small cacti;
 * the second picks how many small ones (1 to MAX_GROUP_SIZE). `forcedKind`
 * overrides the first draw; a forced large is always a single.
 */
export function makeGroup(request: GroupRequest): Drawn<readonly Obstacle[]> {
  const [kindDraw, afterKind] = nextRandom(request.rngState);
  const [sizeDraw, afterSize] = nextRandom(afterKind);
  const kind: ObstacleKind =
    request.forcedKind ??
    (kindDraw < LARGE_CACTUS_PROBABILITY ? 'large' : 'small');
  const size = kind === 'large' ? 1 : 1 + Math.floor(sizeDraw * MAX_GROUP_SIZE);
  const obstacles: Obstacle[] = [];
  let x = request.x;
  for (let i = 0; i < size; i += 1) {
    const obstacle = makeObstacle(kind, x, request.nextId + i, request.group);
    obstacles.push(obstacle);
    x += obstacle.width;
  }
  return [obstacles, afterSize];
}

/**
 * The kind group number `group` must have so that a run shows both sizes
 * early: from group MISSING_KIND_FORCED_AT_GROUP on, a kind that has not
 * spawned yet is forced. `undefined` when nothing is forced.
 */
export function missingKind(
  spawnedKinds: readonly ObstacleKind[],
  group: number,
): ObstacleKind | undefined {
  if (group < MISSING_KIND_FORCED_AT_GROUP) {
    return undefined;
  }
  if (!spawnedKinds.includes('large')) {
    return 'large';
  }
  if (!spawnedKinds.includes('small')) {
    return 'small';
  }
  return undefined;
}

/**
 * The gap from one group's trailing edge to the next group's leading edge,
 * uniform in [minGapPx(laterSpeed), MAX_GAP_FACTOR * minGapPx(speed)).
 * `laterSpeed` (default `speed`) is the highest pace the next group can spawn
 * at, so the gap meets the minimum at the pace current when it appears even
 * while the pace ramps; see `laterSpeedBound`.
 */
export function nextGapPx(
  rngState: number,
  speed: number,
  laterSpeed: number = speed,
): Drawn<number> {
  const [u, next] = nextRandom(rngState);
  const min = minGapPx(laterSpeed);
  const max = MAX_GAP_FACTOR * minGapPx(speed);
  return [min + u * (max - min), next];
}

/**
 * An upper bound on the pace when the next group spawns, for a group spawned
 * on running tick `tick` at `speed` whose trailing edge is at `trailingX`. The
 * next target is at most `trailingX + MAX_GAP_FACTOR * minGapPx(speed)` and
 * scrolls at least `speed` per step, so it reaches the right edge within
 * `horizon` steps, and the pace only ever rises along the ramp.
 */
export function laterSpeedBound(
  tick: number,
  speed: number,
  trailingX: number,
): number {
  const farthest = trailingX + MAX_GAP_FACTOR * minGapPx(speed);
  const horizon = Math.ceil((farthest - CANVAS.width) / speed) + 1;
  return speedAt(tick + Math.max(horizon, 0));
}

/**
 * The first-arrival tick, uniform over the inclusive
 * [max(FIRST_ARRIVAL_TICKS[0], earliest), FIRST_ARRIVAL_TICKS[1]].
 */
export function firstArrivalTick(
  rngState: number,
  earliest: number = FIRST_ARRIVAL_TICKS[0],
): Drawn<number> {
  const [u, next] = nextRandom(rngState);
  const from = Math.max(FIRST_ARRIVAL_TICKS[0], earliest);
  const to = FIRST_ARRIVAL_TICKS[1];
  return [from + Math.floor(u * (to - from + 1)), next];
}

/**
 * The earliest tick on which an obstacle whose hitbox starts `leadHitboxX` px
 * right of its left edge can reach the dinosaur at START_SPEED when its left
 * edge starts at or beyond the right edge of the canvas.
 */
export function earliestArrivalFromEdge(leadHitboxX: number): number {
  return Math.ceil((CANVAS.width + leadHitboxX - DINO_REACH_X) / START_SPEED);
}

/**
 * Where the first group's leading edge stands on the start step (tick 0), so
 * that it reaches the dinosaur exactly on a tick drawn uniformly from
 * FIRST_ARRIVAL_TICKS at START_SPEED, and never starts inside the canvas: the
 * draw's lower bound is raised to `earliestArrivalFromEdge`, so the x is always
 * `>= CANVAS.width` and the group enters at the right edge like every later
 * group. Takes one draw; the group itself is made from the returned state when
 * it spawns, so it is peeked here (pure, same state, same group) to read its
 * leading hitbox offset. The group does not depend on the drawn tick, only on
 * the state after the draw, so the peek can precede choosing the tick.
 *
 * The x is the largest one that still arrives on the drawn tick (the hitbox
 * lands exactly on the dino's reach then). A speed ramp only ever adds
 * distance, so it can never make the group late; it makes it a tick early only
 * once the extra distance reaches a whole START_SPEED step. With the linear
 * ramp that first happens for a drawn tick of 105 and costs at most two ticks
 * at 150, and the drawn tick is at least the edge bound (about 120), so the
 * arrival stays inside FIRST_ARRIVAL_TICKS.
 */
export function firstSpawnX(rngState: number): Drawn<number> {
  const [, next] = nextRandom(rngState);
  const [peek] = makeGroup({ rngState: next, x: 0, nextId: 0, group: 0 });
  const leadHitboxX = peek[0]?.hitbox.x ?? 0;
  const [tick] = firstArrivalTick(
    rngState,
    earliestArrivalFromEdge(leadHitboxX),
  );
  return [DINO_REACH_X + START_SPEED * tick - leadHitboxX, next];
}

/** True when the planned next group has scrolled to the right edge. */
export function shouldSpawn(nextSpawnX: number): boolean {
  return nextSpawnX <= CANVAS.width;
}

/** Moves every obstacle left by `speed` and drops those fully past the left edge. */
export function advanceObstacles(
  obstacles: readonly Obstacle[],
  speed: number,
): readonly Obstacle[] {
  const moved: Obstacle[] = [];
  for (const obstacle of obstacles) {
    const x = obstacle.x - speed;
    if (x + obstacle.width < 0) {
      continue;
    }
    moved.push({
      ...obstacle,
      x,
      hitbox: { ...obstacle.hitbox, x: obstacle.hitbox.x - speed },
    });
  }
  return moved;
}

/** The right edge of a group: where the gap to the next group starts. */
export function trailingEdge(group: readonly Obstacle[]): number {
  let edge = Number.NEGATIVE_INFINITY;
  for (const obstacle of group) {
    edge = Math.max(edge, obstacle.x + obstacle.width);
  }
  return edge;
}
