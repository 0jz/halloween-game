import { describe, expect, it } from 'vitest';
import {
  advanceCandies,
  advanceHat,
  candyRngStart,
  canPlaceCandy,
  canPlaceHat,
  dinoVisible,
  firstHatTick,
  gainHeart,
  hatAllowsSpawn,
  hatClearPx,
  hatRngStart,
  isProtected,
  loseHeart,
  makeCandy,
  makeHat,
  nextCandyInterval,
  nextHatDelay,
  startProtection,
  tickProtection,
  widenSpawnXForCandy,
  widenSpawnXForHat,
} from '../src/pickups.js';
import { makeBat } from '../src/bats.js';
import { makeObstacle } from '../src/obstacles.js';
import { createRng } from '../src/rng.js';
import { Sprites } from '../src/sprites.js';
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
  JUMP_HEIGHT_PX,
  MAX_HEARTS,
  START_SPEED,
} from '../src/tuning.js';

const hatReq = {
  tick: HAT_FIRST_TICK,
  speed: START_SPEED,
  obstacles: [],
  bats: [],
  dueTick: HAT_FIRST_TICK,
  caught: false,
  hatOnScreen: false,
} as const;

describe('hat timing', () => {
  it('seeds from (seed ^ HAT_SALT) >>> 0 and draws inside HAT_RESPAWN_TICKS', () => {
    const seed = 777;
    expect(hatRngStart(seed)).toBe((seed ^ HAT_SALT) >>> 0);
    const [value, next] = nextHatDelay(hatRngStart(seed));
    const rng = createRng((seed ^ HAT_SALT) >>> 0);
    const [lo, hi] = HAT_RESPAWN_TICKS;
    expect(value).toBe(lo + Math.floor(rng.next() * (hi - lo + 1)));
    expect(next).not.toBe(hatRngStart(seed));
    for (let s = 0; s < 200; s += 1) {
      const [d] = nextHatDelay(hatRngStart(s));
      expect(d).toBeGreaterThanOrEqual(lo);
      expect(d).toBeLessThanOrEqual(hi);
    }
  });

  it('the first hat is due at HAT_FIRST_TICK = 1800, never before', () => {
    expect(firstHatTick()).toBe(HAT_FIRST_TICK);
    expect(HAT_FIRST_TICK).toBe(1800);
    expect(canPlaceHat({ ...hatReq, tick: HAT_FIRST_TICK - 1 })).toBe(false);
    expect(canPlaceHat(hatReq)).toBe(true);
    // Even a respawn due tick below the first never places an early hat.
    expect(canPlaceHat({ ...hatReq, tick: 100, dueTick: 0 })).toBe(false);
  });

  it('waits for the respawn due tick', () => {
    const due = HAT_FIRST_TICK + 900;
    expect(canPlaceHat({ ...hatReq, tick: due - 1, dueTick: due })).toBe(false);
    expect(canPlaceHat({ ...hatReq, tick: due, dueTick: due })).toBe(true);
  });

  it('places no hat after a catch, or while one is on screen', () => {
    expect(canPlaceHat({ ...hatReq, caught: true })).toBe(false);
    expect(canPlaceHat({ ...hatReq, tick: 99999, caught: true })).toBe(false);
    expect(canPlaceHat({ ...hatReq, hatOnScreen: true })).toBe(false);
  });
});

describe('hat clearance', () => {
  it('defers while a pumpkin or bat is within the clearance of the right edge', () => {
    const clear = hatClearPx(START_SPEED);
    expect(clear).toBe(HAT_CLEAR_TICKS * START_SPEED);
    const pumpkinNear = makeObstacle('small', 0, 0, 0);
    const widthP = pumpkinNear.width;
    const edgeOk = makeObstacle('small', CANVAS.width - clear - widthP, 1, 1);
    const edgeBad = makeObstacle(
      'small',
      CANVAS.width - clear - widthP + 1,
      2,
      2,
    );
    expect(canPlaceHat({ ...hatReq, obstacles: [edgeOk] })).toBe(true);
    expect(canPlaceHat({ ...hatReq, obstacles: [edgeBad] })).toBe(false);

    const bat = makeBat(0, CANVAS.width - clear - Sprites.bat0.width + 1, 0);
    expect(canPlaceHat({ ...hatReq, bats: [bat] })).toBe(false);
    const batOk = makeBat(0, CANVAS.width - clear - Sprites.bat0.width, 0);
    expect(canPlaceHat({ ...hatReq, bats: [batOk] })).toBe(true);
  });

  it('clearance grows with the speed', () => {
    expect(hatClearPx(12)).toBeGreaterThan(hatClearPx(6));
  });

  it('widens the next pumpkin x past the hat, never lowers it', () => {
    const hat = makeHat(CANVAS.width);
    const wide = widenSpawnXForHat(CANVAS.width, hat, START_SPEED);
    expect(wide).toBe(hat.x + hat.width + hatClearPx(START_SPEED));
    expect(widenSpawnXForHat(5000, hat, START_SPEED)).toBe(5000);
  });

  it('lets a bat or pumpkin spawn only once the hat is clear of the edge', () => {
    expect(hatAllowsSpawn(null, START_SPEED)).toBe(true);
    expect(hatAllowsSpawn(makeHat(CANVAS.width), START_SPEED)).toBe(false);
    const clear = hatClearPx(START_SPEED);
    const hatAt = makeHat(CANVAS.width - clear - Sprites.hat.width);
    expect(hatAllowsSpawn(hatAt, START_SPEED)).toBe(true);
  });
});

describe('hat height and shape', () => {
  it('floats with its hitbox top HAT_TOP_ABOVE_GROUND above the ground', () => {
    const hat = makeHat(CANVAS.width);
    expect(hat.hitbox.y).toBe(GROUND_Y - HAT_TOP_ABOVE_GROUND);
    expect(hat.hitbox.x).toBe(hat.x + Sprites.hat.hitbox.x);
  });

  it('is out of reach of a standing dino and within reach of a full jump', () => {
    const hat = makeHat(CANVAS.width);
    const hatTop = hat.hitbox.y;
    const hatBottom = hat.hitbox.y + hat.hitbox.height;
    const box = Sprites.dinoStand;
    const topAbove = box.height - box.hitbox.y; // standing hitbox top above ground
    const standTopY = GROUND_Y - topAbove;
    // Standing: hitbox bottom stays at/below the hat bottom, so no overlap.
    expect(standTopY).toBeGreaterThanOrEqual(hatBottom);
    // At the jump peak the hitbox top is above the hat's bottom edge: overlap.
    const peakTopY = standTopY - JUMP_HEIGHT_PX;
    expect(peakTopY).toBeLessThan(hatBottom);
    expect(peakTopY + box.hitbox.height).toBeGreaterThan(hatTop);
    // And the hat is not above the peak: the jump hitbox spans it.
    expect(peakTopY).toBeLessThanOrEqual(hatTop);
  });

  it('is out of reach of a ducking dino', () => {
    const duck = Sprites.dinoDuck0;
    const duckTopAbove = duck.height - duck.hitbox.y;
    const hat = makeHat(CANVAS.width);
    expect(GROUND_Y - duckTopAbove).toBeGreaterThan(
      hat.hitbox.y + hat.hitbox.height,
    );
  });
});

describe('hat movement', () => {
  it('scrolls left by the speed and leaves null past the left edge', () => {
    const hat = makeHat(300);
    const moved = advanceHat(hat, 6);
    expect(moved?.x).toBe(294);
    expect(moved?.hitbox.x).toBe(hat.hitbox.x - 6);
    expect(advanceHat(null, 6)).toBeNull();
    const nearlyGone = makeHat(-hat.width + 3);
    expect(advanceHat(nearlyGone, 3)?.x).toBe(-hat.width);
    expect(advanceHat(nearlyGone, 4)).toBeNull();
  });
});

describe('candy', () => {
  it('seeds from (seed ^ CANDY_SALT) >>> 0 and draws inside CANDY_INTERVAL_TICKS', () => {
    const seed = 4242;
    expect(candyRngStart(seed)).toBe((seed ^ CANDY_SALT) >>> 0);
    const [lo, hi] = CANDY_INTERVAL_TICKS;
    expect([lo, hi]).toEqual([240, 480]);
    const [value] = nextCandyInterval(candyRngStart(seed));
    const rng = createRng((seed ^ CANDY_SALT) >>> 0);
    expect(value).toBe(lo + Math.floor(rng.next() * (hi - lo + 1)));
    const seen = new Set<number>();
    for (let s = 0; s < 300; s += 1) {
      const [d] = nextCandyInterval(candyRngStart(s));
      expect(d).toBeGreaterThanOrEqual(lo);
      expect(d).toBeLessThanOrEqual(hi);
      seen.add(d);
    }
    expect(seen.size).toBeGreaterThan(20);
  });

  it('is never placed without candy time', () => {
    expect(canPlaceCandy({ candyTime: false, obstacles: [], bats: [] })).toBe(
      false,
    );
    expect(canPlaceCandy({ candyTime: true, obstacles: [], bats: [] })).toBe(
      true,
    );
  });

  it('defers while a pumpkin or bat is within CANDY_CLEAR_PX of the right edge', () => {
    const w = makeObstacle('small', 0, 0, 0).width;
    const ok = makeObstacle('small', CANVAS.width - CANDY_CLEAR_PX - w, 0, 0);
    const bad = makeObstacle(
      'small',
      CANVAS.width - CANDY_CLEAR_PX - w + 1,
      1,
      1,
    );
    expect(canPlaceCandy({ candyTime: true, obstacles: [ok], bats: [] })).toBe(
      true,
    );
    expect(canPlaceCandy({ candyTime: true, obstacles: [bad], bats: [] })).toBe(
      false,
    );
    const bat = makeBat(
      0,
      CANVAS.width - CANDY_CLEAR_PX - Sprites.bat0.width + 1,
      0,
    );
    expect(canPlaceCandy({ candyTime: true, obstacles: [], bats: [bat] })).toBe(
      false,
    );
  });

  it('lies on the ground and scrolls and is removed off the left edge', () => {
    const candy = makeCandy(3, CANVAS.width);
    expect(candy.id).toBe(3);
    expect(candy.y + candy.height).toBe(GROUND_Y);
    expect(candy.hitbox.x).toBe(candy.x + Sprites.candy.hitbox.x);
    const moved = advanceCandies([candy, makeCandy(4, -candy.width + 2)], 5);
    expect(moved).toHaveLength(1);
    expect(moved[0]?.x).toBe(CANVAS.width - 5);
    expect(moved[0]?.hitbox.x).toBe(candy.hitbox.x - 5);
  });

  it('widens the next pumpkin x past the candy, never lowers it', () => {
    const candy = makeCandy(0, CANVAS.width);
    expect(widenSpawnXForCandy(CANVAS.width, candy)).toBe(
      candy.x + candy.width + CANDY_CLEAR_PX,
    );
    expect(widenSpawnXForCandy(9000, candy)).toBe(9000);
  });
});

describe('hearts', () => {
  it('gains one heart, capped at MAX_HEARTS', () => {
    expect(gainHeart(0)).toBe(1);
    expect(gainHeart(MAX_HEARTS - 1)).toBe(MAX_HEARTS);
    expect(gainHeart(MAX_HEARTS)).toBe(MAX_HEARTS);
    expect(MAX_HEARTS).toBe(3);
  });

  it('loses one heart, never below zero', () => {
    expect(loseHeart(3)).toBe(2);
    expect(loseHeart(1)).toBe(0);
    expect(loseHeart(0)).toBe(0);
  });
});

describe('protection', () => {
  it('starts at INVULN_TICKS and counts down to zero', () => {
    expect(startProtection()).toBe(INVULN_TICKS);
    expect(INVULN_TICKS).toBe(90);
    let left = startProtection();
    let steps = 0;
    while (isProtected(left)) {
      left = tickProtection(left);
      steps += 1;
    }
    expect(steps).toBe(INVULN_TICKS);
    expect(tickProtection(0)).toBe(0);
    expect(isProtected(0)).toBe(false);
    expect(isProtected(1)).toBe(true);
  });

  it('blinks in INVULN_BLINK_TICKS blocks, hidden first, visible at the end', () => {
    expect(dinoVisible(0)).toBe(true);
    expect(dinoVisible(INVULN_TICKS)).toBe(false);
    expect(dinoVisible(INVULN_TICKS - INVULN_BLINK_TICKS + 1)).toBe(false);
    expect(dinoVisible(INVULN_TICKS - INVULN_BLINK_TICKS)).toBe(true);
    expect(dinoVisible(INVULN_TICKS - 2 * INVULN_BLINK_TICKS)).toBe(false);
    let hidden = 0;
    for (let left = INVULN_TICKS; left > 0; left -= 1) {
      if (!dinoVisible(left)) {
        hidden += 1;
      }
    }
    expect(hidden).toBe(INVULN_TICKS / 2);
  });
});
