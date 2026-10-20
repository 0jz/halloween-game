import { describe, expect, it } from 'vitest';
import {
  GRAVITY,
  JUMP_IMPULSE,
  applyGravity,
  isOnGround,
  startJump,
  type VerticalBody,
} from '../src/physics.js';
import {
  JUMP_DURATION_TICKS,
  JUMP_HEIGHT_PX,
  MAX_SPEED,
  START_SPEED,
} from '../src/tuning.js';

const REST_Y = 200;
const grounded: VerticalBody = { y: REST_Y, vy: 0, onGround: true };

/** Jumps from the ground and applies gravity until landing; returns each y. */
function jumpTrajectory(): number[] {
  let body = startJump(grounded);
  const ys: number[] = [];
  for (let i = 0; i < JUMP_DURATION_TICKS * 4 && !isOnGround(body); i += 1) {
    body = applyGravity(body, REST_Y);
    ys.push(body.y);
  }
  return ys;
}

/**
 * Airborne steps of one jump while the world scrolls at `speed`. Physics takes
 * no speed, so the horizontal distance changes and the airtime does not.
 */
function airborneTicksAt(speed: number): { ticks: number; distance: number } {
  let body = startJump(grounded);
  let ticks = 0;
  let distance = 0;
  while (!isOnGround(body) && ticks < JUMP_DURATION_TICKS * 4) {
    body = applyGravity(body, REST_Y);
    distance += speed;
    ticks += 1;
  }
  return { ticks, distance };
}

describe('physics constants', () => {
  it('derives gravity and impulse from JUMP_HEIGHT_PX and JUMP_DURATION_TICKS', () => {
    expect(GRAVITY).toBeCloseTo(
      (8 * JUMP_HEIGHT_PX) / JUMP_DURATION_TICKS ** 2,
    );
    expect(JUMP_IMPULSE).toBeCloseTo(
      (-4 * JUMP_HEIGHT_PX) / JUMP_DURATION_TICKS,
    );
  });
});

describe('startJump', () => {
  it('lifts off a grounded body with the impulse', () => {
    const body = startJump(grounded);

    expect(body).toEqual({ y: REST_Y, vy: JUMP_IMPULSE, onGround: false });
    expect(isOnGround(body)).toBe(false);
  });

  it('leaves an airborne body unchanged (no double jump)', () => {
    const airborne = applyGravity(startJump(grounded), REST_Y);

    expect(startJump(airborne)).toBe(airborne);
  });

  it('passes other fields through', () => {
    const body = startJump({ ...grounded, frame: 1 });

    expect(body.frame).toBe(1);
  });
});

describe('applyGravity', () => {
  it('leaves a grounded body unchanged', () => {
    expect(applyGravity(grounded, REST_Y)).toBe(grounded);
  });

  it('lands after exactly JUMP_DURATION_TICKS steps, snapped to the ground', () => {
    const ys = jumpTrajectory();

    expect(ys).toHaveLength(JUMP_DURATION_TICKS);
    expect(ys.at(-1)).toBe(REST_Y);
    for (const y of ys.slice(0, -1)) {
      expect(y).toBeLessThan(REST_Y);
    }
  });

  it('peaks at JUMP_HEIGHT_PX above the ground halfway through', () => {
    const ys = jumpTrajectory();
    const apex = Math.min(...ys);

    expect(REST_Y - apex).toBeCloseTo(JUMP_HEIGHT_PX, 6);
    expect(ys.indexOf(apex)).toBe(JUMP_DURATION_TICKS / 2 - 1);
  });

  it('rises then falls: y decreases to the apex and increases after it', () => {
    const ys = jumpTrajectory();
    const apexIndex = ys.indexOf(Math.min(...ys));

    for (let i = 1; i <= apexIndex; i += 1) {
      expect(ys[i]).toBeLessThan(ys[i - 1] ?? Infinity);
    }
    for (let i = apexIndex + 1; i < ys.length; i += 1) {
      expect(ys[i]).toBeGreaterThan(ys[i - 1] ?? -Infinity);
    }
  });
});

describe('2.4 jump unchanged with pace', () => {
  it('keeps the airborne tick count equal at speed 6 (START_SPEED) and 12 (MAX_SPEED)', () => {
    const slow = airborneTicksAt(START_SPEED);
    const fast = airborneTicksAt(MAX_SPEED);

    expect(slow.ticks).toBe(JUMP_DURATION_TICKS);
    expect(fast.ticks).toBe(slow.ticks);
    expect(fast.distance).toBe((slow.distance * MAX_SPEED) / START_SPEED);
  });
});
