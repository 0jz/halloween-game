import { describe, expect, it } from 'vitest';
import {
  DINO_REACH_X,
  advanceObstacles,
  earliestArrivalFromEdge,
  firstArrivalTick,
  firstSpawnX,
  laterSpeedBound,
  makeGroup,
  makeObstacle,
  missingKind,
  nextGapPx,
  shouldSpawn,
  speedAt,
  trailingEdge,
} from '../src/obstacles.js';
import { nextRandom } from '../src/rng.js';
import { Sprites } from '../src/sprites.js';
import {
  CANVAS,
  DINO_X,
  FIRST_ARRIVAL_TICKS,
  GROUND_Y,
  JUMP_DURATION_TICKS,
  MAX_GAP_FACTOR,
  MAX_GROUP_SIZE,
  MAX_SPEED,
  MAX_SPEED_AT_TICK,
  MISSING_KIND_FORCED_AT_GROUP,
  REACTION_TICKS,
  START_SPEED,
  minGapPx,
} from '../src/tuning.js';
import type { Obstacle } from '../src/types.js';

/** `count` rng states reached by drawing from `seed`, one draw apart. */
function rngStates(seed: number, count: number): number[] {
  const states: number[] = [];
  let state = seed >>> 0;
  for (let i = 0; i < count; i += 1) {
    states.push(state);
    [, state] = nextRandom(state);
  }
  return states;
}

describe('nextGapPx (2.3 gap rule)', () => {
  it.each([6, 9, 12])(
    'stays in [minGapPx, MAX_GAP_FACTOR * minGapPx] over 10,000 samples at speed %d',
    (speed) => {
      const min = speed * (JUMP_DURATION_TICKS + REACTION_TICKS);
      expect(minGapPx(speed)).toBe(min);
      let state = 7;
      let lowest = Number.POSITIVE_INFINITY;
      let highest = 0;
      for (let i = 0; i < 10_000; i += 1) {
        const [gap, next] = nextGapPx(state, speed);
        expect(gap).toBeGreaterThanOrEqual(min);
        expect(gap).toBeLessThanOrEqual(MAX_GAP_FACTOR * min);
        lowest = Math.min(lowest, gap);
        highest = Math.max(highest, gap);
        state = next;
      }
      // The gaps vary over most of the range, so no fixed rhythm.
      expect(lowest).toBeLessThan(min * 1.05);
      expect(highest).toBeGreaterThan(MAX_GAP_FACTOR * min * 0.95);
    },
  );
});

describe('speedAt (2.4 pace)', () => {
  it('starts at START_SPEED on tick 0', () => {
    expect(speedAt(0)).toBe(START_SPEED);
  });

  it('is about 1.3x START_SPEED at 30 s (tick 1800)', () => {
    expect(Math.abs(speedAt(1800) / START_SPEED - 1.3)).toBeLessThanOrEqual(
      0.05,
    );
  });

  it('reaches MAX_SPEED at MAX_SPEED_AT_TICK and stays there', () => {
    expect(speedAt(MAX_SPEED_AT_TICK)).toBe(MAX_SPEED);
    expect(speedAt(7200)).toBe(MAX_SPEED);
    expect(speedAt(1_000_000)).toBe(MAX_SPEED);
  });

  it('never decreases', () => {
    for (let t = 1; t <= MAX_SPEED_AT_TICK + 10; t += 1) {
      expect(speedAt(t)).toBeGreaterThanOrEqual(speedAt(t - 1));
    }
  });
});

describe('nextGapPx with a ramping pace (2.3 gap rule at 2.4 speeds)', () => {
  it('stays in [minGapPx(laterSpeed), MAX_GAP_FACTOR * minGapPx(speed)]', () => {
    let state = 11;
    for (let i = 0; i < 10_000; i += 1) {
      const [gap, next] = nextGapPx(state, 9, 9.3);
      expect(gap).toBeGreaterThanOrEqual(minGapPx(9.3));
      expect(gap).toBeLessThanOrEqual(MAX_GAP_FACTOR * minGapPx(9));
      state = next;
    }
  });

  it('bounds the pace at the next spawn from the farthest possible target', () => {
    const tick = 1000;
    const speed = speedAt(tick);
    const trailing = CANVAS.width + 40;
    const bound = laterSpeedBound(tick, speed, trailing);
    const horizon = Math.ceil(
      (trailing + MAX_GAP_FACTOR * minGapPx(speed) - CANVAS.width) / speed,
    );
    expect(bound).toBeGreaterThanOrEqual(speedAt(tick + horizon));
    expect(laterSpeedBound(MAX_SPEED_AT_TICK, MAX_SPEED, trailing)).toBe(
      MAX_SPEED,
    );
  });
});

describe('makeObstacle', () => {
  it.each(['small', 'large'] as const)(
    'stands a %s cactus on the ground with an absolute hitbox',
    (kind) => {
      const sprite =
        kind === 'small' ? Sprites.cactusSmall : Sprites.cactusLarge;
      const obstacle = makeObstacle(kind, 300, 4, 2);
      expect(obstacle).toEqual({
        id: 4,
        group: 2,
        kind,
        x: 300,
        y: GROUND_Y - sprite.height,
        width: sprite.width,
        height: sprite.height,
        hitbox: {
          x: 300 + sprite.hitbox.x,
          y: GROUND_Y - sprite.height + sprite.hitbox.y,
          width: sprite.hitbox.width,
          height: sprite.hitbox.height,
        },
      });
    },
  );
});

describe('makeGroup (2.3 groups)', () => {
  const groups = rngStates(1, 2000).map((rngState, i) => {
    const [group] = makeGroup({ rngState, x: 800, nextId: 10, group: i });
    return { group, index: i };
  });

  it('makes 1 to MAX_GROUP_SIZE obstacles sharing one group, with consecutive ids', () => {
    for (const { group, index } of groups) {
      expect(group.length).toBeGreaterThanOrEqual(1);
      expect(group.length).toBeLessThanOrEqual(MAX_GROUP_SIZE);
      group.forEach((obstacle, i) => {
        expect(obstacle.group).toBe(index);
        expect(obstacle.id).toBe(10 + i);
      });
    }
  });

  it('places the obstacles of a group directly next to each other from x', () => {
    for (const { group } of groups) {
      let x = 800;
      for (const obstacle of group) {
        expect(obstacle.x).toBe(x);
        x += obstacle.width;
      }
      expect(trailingEdge(group)).toBe(x);
    }
  });

  it('makes groups of two or more from small cacti only', () => {
    for (const { group } of groups) {
      if (group.length > 1) {
        expect(group.every((o) => o.kind === 'small')).toBe(true);
      }
    }
  });

  it('makes single large, and single and grouped small cacti', () => {
    const shapes = new Set(
      groups.map(
        ({ group }) => `${String(group.length)}${group[0]?.kind ?? ''}`,
      ),
    );
    expect([...shapes].sort()).toEqual([
      '1large',
      '1small',
      '2small',
      '3small',
    ]);
  });

  it('is a pure function of its rng state and takes two draws', () => {
    const [a, afterA] = makeGroup({ rngState: 99, x: 0, nextId: 0, group: 0 });
    const [b, afterB] = makeGroup({ rngState: 99, x: 0, nextId: 0, group: 0 });
    expect(a).toEqual(b);
    expect(afterA).toBe(afterB);
    expect(afterA).toBe(rngStates(99, 3)[2]);
  });

  it('honours a forced kind, a forced large being a single', () => {
    for (const rngState of rngStates(1, 200)) {
      const [large] = makeGroup({
        rngState,
        x: 0,
        nextId: 0,
        group: 0,
        forcedKind: 'large',
      });
      expect(large.map((o) => o.kind)).toEqual(['large']);
      const [small] = makeGroup({
        rngState,
        x: 0,
        nextId: 0,
        group: 0,
        forcedKind: 'small',
      });
      expect(small.every((o) => o.kind === 'small')).toBe(true);
    }
  });
});

describe('missingKind (both sizes guarantee)', () => {
  it('forces nothing before MISSING_KIND_FORCED_AT_GROUP', () => {
    for (let g = 0; g < MISSING_KIND_FORCED_AT_GROUP; g += 1) {
      expect(missingKind(['small', 'small'], g)).toBeUndefined();
    }
  });

  it('forces the kind a run has not shown from MISSING_KIND_FORCED_AT_GROUP on', () => {
    const at = MISSING_KIND_FORCED_AT_GROUP;
    expect(missingKind(['small', 'small', 'small'], at)).toBe('large');
    expect(missingKind(['large', 'large', 'large'], at)).toBe('small');
    expect(missingKind(['large', 'small'], at)).toBeUndefined();
    expect(missingKind(['small'], at + 5)).toBe('large');
  });
});

describe('firstSpawnX (2.3 first cactus)', () => {
  const reach =
    DINO_X + Sprites.dinoStand.hitbox.x + Sprites.dinoStand.hitbox.width;

  it('measures the reach from the dino hitbox', () => {
    expect(DINO_REACH_X).toBe(reach);
  });

  it('draws the arrival tick uniformly over FIRST_ARRIVAL_TICKS', () => {
    const [from, to] = FIRST_ARRIVAL_TICKS;
    const seen = new Set<number>();
    for (const state of rngStates(3, 5000)) {
      const [tick] = firstArrivalTick(state);
      expect(tick).toBeGreaterThanOrEqual(from);
      expect(tick).toBeLessThanOrEqual(to);
      seen.add(tick);
    }
    expect(seen.size).toBe(to - from + 1);
  });

  it('reaches the dinosaur exactly on the drawn tick at START_SPEED', () => {
    for (const state of rngStates(5, 1000)) {
      const [x0, next] = firstSpawnX(state);
      const [group] = makeGroup({ rngState: next, x: x0, nextId: 0, group: 0 });
      const lead = group[0];
      const earliest = earliestArrivalFromEdge((lead?.hitbox.x ?? 0) - x0);
      const [tick] = firstArrivalTick(state, earliest);
      expect(tick).toBeGreaterThanOrEqual(FIRST_ARRIVAL_TICKS[0]);
      expect(tick).toBeLessThanOrEqual(FIRST_ARRIVAL_TICKS[1]);
      expect(lead).toBeDefined();
      const hitboxAt = (t: number): number =>
        (lead?.hitbox.x ?? 0) - START_SPEED * t;
      expect(hitboxAt(tick)).toBeLessThanOrEqual(reach);
      expect(hitboxAt(tick - 1)).toBeGreaterThan(reach);
    }
  });
});

describe('firstSpawnX (2.3 first cactus enters from the right edge)', () => {
  it('starts the first group at or beyond the right edge', () => {
    for (const state of rngStates(11, 5000)) {
      const [x0] = firstSpawnX(state);
      expect(x0).toBeGreaterThanOrEqual(CANVAS.width);
    }
  });
});

describe('shouldSpawn', () => {
  it('spawns once the planned leading edge reaches the right edge', () => {
    expect(shouldSpawn(CANVAS.width + 0.5)).toBe(false);
    expect(shouldSpawn(CANVAS.width)).toBe(true);
    expect(shouldSpawn(CANVAS.width - 6)).toBe(true);
  });
});

describe('advanceObstacles (2.3 removal)', () => {
  const small = (x: number, id: number): Obstacle =>
    makeObstacle('small', x, id, 0);

  it('moves obstacles and their hitboxes left by speed', () => {
    const [moved] = advanceObstacles([small(100, 0)], 6);
    expect(moved).toEqual(small(94, 0));
  });

  it('drops an obstacle once it is fully past the left edge, keeping order', () => {
    const width = Sprites.cactusSmall.width;
    const obstacles = [
      small(-width + 6, 0),
      small(-width + 5, 1),
      small(40, 2),
    ];
    const moved = advanceObstacles(obstacles, 6);
    // x + width === 0 is still touching the edge; x + width < 0 is gone.
    expect(moved.map((o) => o.id)).toEqual([0, 2]);
    expect(moved[0]?.x).toBe(-width);
  });

  it('does not mutate its input', () => {
    const obstacles = [small(100, 0)];
    advanceObstacles(obstacles, 6);
    expect(obstacles[0]?.x).toBe(100);
  });
});
