import { describe, expect, it } from 'vitest';
import {
  FIRST_ARRIVAL_TICKS,
  JUMP_DURATION_TICKS,
  MAX_SPEED,
  MAX_SPEED_AT_TICK,
  MIN_GAP_FACTOR,
  REACTION_TICKS,
  START_SPEED,
  STEP_MS,
  STEP_SECONDS,
  minGapPx,
} from '../src/tuning.js';

const ticksFor = (seconds: number): number =>
  Math.round(seconds / STEP_SECONDS);

describe('tuning', () => {
  it('caps the pace at twice the starting pace', () => {
    expect(MAX_SPEED).toBe(2 * START_SPEED);
  });

  it('reaches the maximum pace after 90 seconds of steps', () => {
    expect(MAX_SPEED_AT_TICK).toBe(ticksFor(90));
  });

  it('keeps a jump at 0.6 seconds', () => {
    expect(JUMP_DURATION_TICKS).toBe(ticksFor(0.6));
  });

  it('brings the first obstacle between 1.5 and 2.5 seconds', () => {
    expect(FIRST_ARRIVAL_TICKS).toEqual([ticksFor(1.5), ticksFor(2.5)]);
  });

  it('agrees on the step length in seconds and milliseconds', () => {
    expect(STEP_MS).toBeCloseTo(STEP_SECONDS * 1000);
  });

  it('sizes the minimum gap as speed times jump plus reaction ticks', () => {
    expect(MIN_GAP_FACTOR).toBe(JUMP_DURATION_TICKS + REACTION_TICKS);
    expect(minGapPx(START_SPEED)).toBe(
      START_SPEED * (JUMP_DURATION_TICKS + REACTION_TICKS),
    );
  });
});
