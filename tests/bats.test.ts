import { describe, expect, it } from 'vitest';
import {
  advanceBats,
  batGapPx,
  batRngStart,
  batWing,
  canPlaceBat,
  firstBatTick,
  freeSpaceAtRightEdge,
  makeBat,
  nextBatInterval,
  widenSpawnX,
} from '../src/bats.js';
import { makeObstacle } from '../src/obstacles.js';
import { createRng } from '../src/rng.js';
import {
  BAT_FIRST_TICK,
  BAT_FIRST_TICK_MAX,
  BAT_FLAP_TICKS,
  BAT_HITBOX_HEIGHT,
  BAT_HITBOX_TOP_ABOVE_GROUND,
  BAT_INTERVAL_TICKS,
  BAT_SALT,
  BAT_TO_BAT_TICKS,
  CANVAS,
  GROUND_Y,
  START_SPEED,
} from '../src/tuning.js';

describe('bat stream', () => {
  it('seeds from (seed ^ BAT_SALT) >>> 0, the same as createRng', () => {
    const seed = 12345;
    expect(batRngStart(seed)).toBe((seed ^ BAT_SALT) >>> 0);
    const [value] = firstBatTick(batRngStart(seed));
    const rng = createRng((seed ^ BAT_SALT) >>> 0);
    const expected =
      BAT_FIRST_TICK +
      Math.floor(rng.next() * (BAT_FIRST_TICK_MAX - BAT_FIRST_TICK + 1));
    expect(value).toBe(expected);
  });

  it('draws the first bat tick inside [BAT_FIRST_TICK, BAT_FIRST_TICK_MAX]', () => {
    for (let seed = 0; seed < 500; seed += 1) {
      const [tick] = firstBatTick(batRngStart(seed));
      expect(tick).toBeGreaterThanOrEqual(BAT_FIRST_TICK);
      expect(tick).toBeLessThanOrEqual(BAT_FIRST_TICK_MAX);
    }
  });

  it('draws later intervals inside BAT_INTERVAL_TICKS and is deterministic', () => {
    let state = batRngStart(7);
    for (let i = 0; i < 300; i += 1) {
      const [interval, next] = nextBatInterval(state);
      expect(interval).toBeGreaterThanOrEqual(BAT_INTERVAL_TICKS[0]);
      expect(interval).toBeLessThanOrEqual(BAT_INTERVAL_TICKS[1]);
      state = next;
    }
    expect(nextBatInterval(99)).toEqual(nextBatInterval(99));
  });
});

describe('bat geometry', () => {
  it('puts the hitbox top BAT_HITBOX_TOP_ABOVE_GROUND above the ground', () => {
    const bat = makeBat(3, CANVAS.width, 0);
    expect(bat.id).toBe(3);
    expect(bat.hitbox.y).toBe(GROUND_Y - BAT_HITBOX_TOP_ABOVE_GROUND);
    expect(bat.hitbox.height).toBe(BAT_HITBOX_HEIGHT);
  });

  it('toggles the wing every BAT_FLAP_TICKS', () => {
    expect(batWing(0)).toBe(0);
    expect(batWing(BAT_FLAP_TICKS - 1)).toBe(0);
    expect(batWing(BAT_FLAP_TICKS)).toBe(1);
    expect(batWing(BAT_FLAP_TICKS * 2)).toBe(0);
  });

  it('scrolls bats by speed and drops them once fully off the left edge', () => {
    const bat = makeBat(0, 100, 0);
    const [moved] = advanceBats([bat], 6, 8);
    expect(moved?.x).toBe(94);
    expect(moved?.hitbox.x).toBe(bat.hitbox.x - 6);
    expect(moved?.wing).toBe(1);
    const gone = makeBat(1, -bat.width - 5, 0);
    expect(advanceBats([gone], 6, 0)).toEqual([]);
  });
});

describe('bat placement', () => {
  const speed = START_SPEED;

  it('allows a bat with no obstacles on screen', () => {
    expect(freeSpaceAtRightEdge([])).toBe(Number.POSITIVE_INFINITY);
    expect(canPlaceBat({ tick: 1600, speed, obstacles: [] })).toBe(true);
  });

  it('allows a bat when the free space meets the minimum gap', () => {
    const gap = batGapPx(1600, speed);
    const pumpkin = makeObstacle('small', 0, 0, 0);
    const x = CANVAS.width - gap - pumpkin.width;
    const obstacles = [makeObstacle('small', x, 0, 0)];
    expect(freeSpaceAtRightEdge(obstacles)).toBeCloseTo(gap, 9);
    expect(canPlaceBat({ tick: 1600, speed, obstacles })).toBe(true);
  });

  it('refuses a bat when the free space is below the minimum gap', () => {
    const gap = batGapPx(1600, speed);
    const pumpkin = makeObstacle('small', 0, 0, 0);
    const x = CANVAS.width - gap - pumpkin.width + 1;
    const obstacles = [makeObstacle('small', x, 0, 0)];
    expect(canPlaceBat({ tick: 1600, speed, obstacles })).toBe(false);
  });

  it('measures from the trailing edge of the rightmost obstacle', () => {
    const far = makeObstacle('small', CANVAS.width - 10, 0, 0);
    const near = makeObstacle('small', 100, 1, 1);
    expect(freeSpaceAtRightEdge([near, far])).toBe(
      CANVAS.width - (far.x + far.width),
    );
    expect(canPlaceBat({ tick: 1600, speed, obstacles: [near, far] })).toBe(
      false,
    );
  });

  it('keeps BAT_TO_BAT_TICKS between two bats', () => {
    const last = 1600;
    const at = (tick: number): boolean =>
      canPlaceBat({ tick, speed, obstacles: [], lastBatTick: last });
    expect(at(last + BAT_TO_BAT_TICKS - 1)).toBe(false);
    expect(at(last + BAT_TO_BAT_TICKS)).toBe(true);
  });
});

describe('widening nextSpawnX', () => {
  const speed = START_SPEED;
  const bat = makeBat(0, CANVAS.width, 1600);
  const needed = bat.x + bat.width + batGapPx(1600, speed);

  it('raises a target that would land on or near the bat', () => {
    expect(widenSpawnX(CANVAS.width, bat, 1600, speed)).toBe(needed);
    expect(widenSpawnX(CANVAS.width + 10, bat, 1600, speed)).toBe(needed);
  });

  it('never lowers a target that is already far enough', () => {
    expect(widenSpawnX(needed + 123, bat, 1600, speed)).toBe(needed + 123);
  });
});
