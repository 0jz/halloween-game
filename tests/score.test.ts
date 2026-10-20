import { describe, expect, it } from 'vitest';
import {
  advanceScore,
  beatsHighScore,
  formatScore,
  isMilestone,
  scoreFromDistance,
} from '../src/score.js';
import {
  MAX_SCORE,
  MAX_SPEED,
  MILESTONE_EVERY,
  SCORE_PER_SECOND,
  START_SPEED,
} from '../src/tuning.js';

/** Distance after `ticks` steps at a constant `speed`, from 0. */
function distanceAfter(ticks: number, speed: number): number {
  let distance = 0;
  for (let i = 0; i < ticks; i += 1) {
    distance = advanceScore(distance, speed);
  }
  return distance;
}

describe('advanceScore', () => {
  it('adds about SCORE_PER_SECOND over 60 ticks at START_SPEED', () => {
    expect(distanceAfter(60, START_SPEED)).toBeCloseTo(SCORE_PER_SECOND, 6);
    expect(Math.abs(distanceAfter(60, START_SPEED) - 10)).toBeLessThan(0.5);
  });

  it('adds twice as much at MAX_SPEED', () => {
    expect(distanceAfter(60, MAX_SPEED)).toBeCloseTo(
      (SCORE_PER_SECOND * MAX_SPEED) / START_SPEED,
      6,
    );
    expect(Math.abs(distanceAfter(60, MAX_SPEED) - 20)).toBeLessThan(0.5);
  });

  it('adds SCORE_PER_SECOND / 60 points per tick at START_SPEED', () => {
    expect(advanceScore(5, START_SPEED)).toBeCloseTo(
      5 + SCORE_PER_SECOND / 60,
      12,
    );
  });
});

describe('scoreFromDistance', () => {
  it('floors to whole points', () => {
    expect(scoreFromDistance(0)).toBe(0);
    expect(scoreFromDistance(42.7)).toBe(42);
  });

  it('absorbs float drift so 60 ticks at START_SPEED read as a full second', () => {
    expect(scoreFromDistance(distanceAfter(60, START_SPEED))).toBe(
      SCORE_PER_SECOND,
    );
    expect(scoreFromDistance(9.999999999999998)).toBe(10);
  });

  it('caps at MAX_SCORE', () => {
    expect(scoreFromDistance(MAX_SCORE + 1000)).toBe(MAX_SCORE);
  });
});

describe('formatScore', () => {
  it('pads zero to five digits', () => {
    expect(formatScore(0)).toBe('00000');
  });

  it('pads a small score with leading zeros', () => {
    expect(formatScore(42)).toBe('00042');
  });

  it('floors fractional points', () => {
    expect(formatScore(42.7)).toBe('00042');
    expect(formatScore(99.999)).toBe('00099');
  });

  it('shows MAX_SCORE as is', () => {
    expect(formatScore(MAX_SCORE)).toBe(String(MAX_SCORE));
    expect(formatScore(MAX_SCORE)).toBe('99999');
  });

  it('caps anything above MAX_SCORE', () => {
    expect(formatScore(123456)).toBe(String(MAX_SCORE));
    expect(formatScore(MAX_SCORE + 0.5)).toBe(String(MAX_SCORE));
  });

  it('treats negative and NaN input as zero', () => {
    expect(formatScore(-1)).toBe('00000');
    expect(formatScore(-0.5)).toBe('00000');
    expect(formatScore(Number.NaN)).toBe('00000');
  });
});

describe('isMilestone', () => {
  it('fires on reaching a multiple exactly: 99 -> 100', () => {
    expect(isMilestone(99, 100)).toBe(100);
    expect(isMilestone(99, 100)).toBe(MILESTONE_EVERY);
  });

  it('fires when the step skips over a multiple: 199 -> 201', () => {
    expect(isMilestone(199, 201)).toBe(200);
  });

  it('is null below the first multiple', () => {
    expect(isMilestone(0, 1)).toBeNull();
    expect(isMilestone(42, 43)).toBeNull();
    expect(isMilestone(98, 99)).toBeNull();
  });

  it('is null at 0 -> 0: zero is never a milestone', () => {
    expect(isMilestone(0, 0)).toBeNull();
  });

  it('does not re-trigger while the score stays on a multiple', () => {
    expect(isMilestone(100, 100)).toBeNull();
    expect(isMilestone(100, 101)).toBeNull();
  });

  it('returns the highest multiple when one step crosses several', () => {
    expect(isMilestone(99, 201)).toBe(200);
  });

  it('fires for the last multiple below MAX_SCORE', () => {
    expect(isMilestone(99899, 99900)).toBe(99900);
    expect(isMilestone(99900, MAX_SCORE)).toBeNull();
  });
});

describe('beatsHighScore', () => {
  // A zero-score death cannot be reached through createGame: the first cactus
  // arrives no earlier than FIRST_ARRIVAL_TICKS[0] (90 ticks, 15 points), so
  // the zero-score row of the high score rule is proven here.
  it('is false for a zero-score run with no recorded best, so nothing is saved', () => {
    expect(beatsHighScore(0, null)).toBe(false);
  });

  it('is true for any positive score with no recorded best', () => {
    expect(beatsHighScore(1, null)).toBe(true);
  });

  it('is true only when the score is strictly above hi', () => {
    expect(beatsHighScore(8, 7)).toBe(true);
    expect(beatsHighScore(7, 7)).toBe(false);
    expect(beatsHighScore(6, 7)).toBe(false);
    expect(beatsHighScore(0, 0)).toBe(false);
  });
});
