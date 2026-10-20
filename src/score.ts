// Score helpers. Pure: no DOM, no clock. Source: technical considerations 2.2.

import {
  MAX_SCORE,
  MILESTONE_EVERY,
  SCORE_PER_SECOND,
  START_SPEED,
  STEP_SECONDS,
} from './tuning.js';

/** Digits on the score display: as many as MAX_SCORE has (five). */
const SCORE_DIGITS = String(MAX_SCORE).length;

/**
 * Tolerance for float drift in the accumulated distance: sixty steps of 1/6
 * sum to 9.999999999999998, which must still read as 10 points after 1 s.
 */
const DISTANCE_EPSILON = 1e-6;

/**
 * Advances the exact, unfloored score distance by one step at `speed`:
 * SCORE_PER_SECOND / 60 points per step at START_SPEED, proportionally more
 * when faster (technical considerations 2.3).
 */
export function advanceScore(distance: number, speed: number): number {
  return distance + (SCORE_PER_SECOND * STEP_SECONDS * speed) / START_SPEED;
}

/**
 * The whole points a distance is worth: floored (with a tiny tolerance for
 * float drift) and capped at MAX_SCORE. This is `GameState.score`.
 */
export function scoreFromDistance(distance: number): number {
  const points = Math.floor(distance + DISTANCE_EPSILON);
  return points > 0 ? Math.min(points, MAX_SCORE) : 0;
}

/**
 * The multiple of MILESTONE_EVERY the score crossed on its way from `before`
 * to `after` (both whole, floored scores), or `null` if it crossed none. This
 * is the `milestone` event's payload (architecture 3).
 *
 * - Reaching a multiple exactly counts: 99 → 100 is 100.
 * - Staying on a multiple does not re-trigger: 100 → 100 is null.
 * - 0 is never a milestone, so 0 → 0 is null.
 * - A jump across several multiples in one step (99 → 201, impossible at real
 *   speeds, which add well under one point per step) returns the highest one,
 *   giving 200: the score on screen is past it, so it is the one worth marking,
 *   and one step emits at most one event, which restarts the blink once.
 */
export function isMilestone(before: number, after: number): number | null {
  const crossed = Math.floor(after / MILESTONE_EVERY);
  if (crossed <= 0 || crossed <= Math.floor(before / MILESTONE_EVERY)) {
    return null;
  }
  return crossed * MILESTONE_EVERY;
}

/**
 * The high score rule (architecture 3): a run's final score is a new best
 * exactly when it beats `hi ?? 0`. A zero-score run with no recorded best is
 * not one, so it saves nothing and no `HI` appears.
 */
export function beatsHighScore(score: number, hi: number | null): boolean {
  return score > (hi ?? 0);
}

/**
 * Formats a score for the HUD: floored to whole points, capped at MAX_SCORE
 * and zero-padded to five digits (42.7 → "00042", 123456 → "99999").
 * Negative and NaN input is treated as 0.
 */
export function formatScore(n: number): string {
  const points = n > 0 ? Math.min(Math.floor(n), MAX_SCORE) : 0;
  return String(points).padStart(SCORE_DIGITS, '0');
}
