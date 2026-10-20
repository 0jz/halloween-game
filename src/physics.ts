// Vertical jump physics over plain data (technical considerations 2.2 and 2.4
// steps 4 and 5). Pure: no DOM, no clock, and no dependency on the running
// pace, so the jump stays the same height and length as the game speeds up.
//
// Coordinates follow the canvas: y grows downward, so a jump is a negative
// velocity. Each step uses the exact constant-acceleration update
// (y += vy + g / 2, then vy += g), so with the impulse and gravity below the
// apex is exactly JUMP_HEIGHT_PX after JUMP_DURATION_TICKS / 2 steps and the
// body is back on the ground after JUMP_DURATION_TICKS steps.

import { JUMP_DURATION_TICKS, JUMP_HEIGHT_PX } from './tuning.js';

/** The vertical state physics reads and writes; extra fields pass through. */
export interface VerticalBody {
  /** Top edge, logical px. */
  readonly y: number;
  /** Vertical velocity, px per step; negative is upward. */
  readonly vy: number;
  readonly onGround: boolean;
}

/** Downward acceleration, px per step², derived from the jump height and duration. */
export const GRAVITY = (8 * JUMP_HEIGHT_PX) / JUMP_DURATION_TICKS ** 2;

/** Take-off velocity, px per step (upward, so negative). */
export const JUMP_IMPULSE = (-4 * JUMP_HEIGHT_PX) / JUMP_DURATION_TICKS;

/** Absorbs float error so a landing body is snapped exactly onto the ground. */
const LANDING_EPSILON_PX = 1e-6;

export function isOnGround(body: VerticalBody): boolean {
  return body.onGround;
}

/** Starts a jump from the ground; an airborne body is returned unchanged. */
export function startJump<T extends VerticalBody>(body: T): T {
  if (!isOnGround(body)) {
    return body;
  }
  return { ...body, vy: JUMP_IMPULSE, onGround: false };
}

/**
 * One step of gravity for a body whose top edge rests at `restY` when on the
 * ground. A grounded body is returned unchanged; a body that reaches the
 * ground is snapped to `restY` with zero velocity and `onGround` true.
 */
export function applyGravity<T extends VerticalBody>(
  body: T,
  restY: number,
): T {
  if (isOnGround(body)) {
    return body;
  }
  const y = body.y + body.vy + GRAVITY / 2;
  const vy = body.vy + GRAVITY;
  if (vy > 0 && y >= restY - LANDING_EPSILON_PX) {
    return { ...body, y: restY, vy: 0, onGround: true };
  }
  return { ...body, y, vy };
}
