// Seeded random numbers. Pure: no DOM, no clock, no Math.random.
// Source: technical considerations 2.2 (rng row), architecture 2.2 Seed lifecycle.
//
// mulberry32 is a tiny, fast 32-bit generator by Tommy Ettinger: one uint32 of
// state, a fixed increment per draw, and a few multiply/xor-shift rounds to mix
// the bits. It is not cryptographic, but it is well distributed and, given the
// same seed, always produces the same sequence: exactly what replay needs.

import { MAX_SEED } from './tuning.js';
import type { Rng } from './types.js';

/** mulberry32's increment (a Weyl sequence constant), added to the state per draw. */
const INCREMENT = 0x6d2b79f5;

/** 2^32: divides a uint32 into [0, 1). */
const UINT32_RANGE = 2 ** 32;

/**
 * One mulberry32 draw as a pure function: takes a uint32 state, returns the
 * value in [0, 1) and the next uint32 state. No closure and no mutation, so
 * `game.ts` can keep the state as a plain number inside its run state and a
 * step stays a pure function of its input.
 */
export function nextRandom(
  state: number,
): readonly [value: number, state: number] {
  // `>>> 0` keeps the state an unsigned 32-bit integer instead of letting it grow.
  const next = (state + INCREMENT) >>> 0;
  let t = Math.imul(next ^ (next >>> 15), next | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  return [value, next];
}

/**
 * An `Rng` for callers that just want `next()`: the state lives in a closure
 * and each call advances it with `nextRandom`. Same seed, same sequence.
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return {
    next(): number {
      const [value, nextState] = nextRandom(state);
      state = nextState;
      return value;
    },
  };
}

/** Only plain decimal digits: no sign, no decimal point, no whitespace. */
const WHOLE_NUMBER = /^\d+$/;

/**
 * Reads `seed` from a query string (`location.search`, with or without the
 * leading `?`). Returns a whole number from 0 to `MAX_SEED`, or `undefined`
 * when `seed` is missing, empty, not a whole number, or too large: mulberry32
 * keeps 32 bits, so a larger seed would silently replay a smaller one.
 * Leading zeros are allowed (`007` is 7); with repeated keys the first wins.
 */
export function parseSeed(search: string): number | undefined {
  const value = new URLSearchParams(search).get('seed');
  if (value === null || !WHOLE_NUMBER.test(value)) {
    return undefined;
  }
  const seed = Number(value);
  // isSafeInteger guards against digit strings too long to be exact numbers.
  return Number.isSafeInteger(seed) && seed <= MAX_SEED ? seed : undefined;
}
