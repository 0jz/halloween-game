import { describe, expect, it } from 'vitest';
import { createRng, nextRandom, parseSeed } from '../src/rng.js';

/**
 * The published mulberry32 reference (closure form, by Tommy Ettinger),
 * copied verbatim apart from formatting, so the known-answer check below is
 * computed from the reference rather than from a hard-coded number.
 */
function referenceMulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The first `count` values from chaining `nextRandom` from `seed`. */
function chain(seed: number, count: number): number[] {
  const values: number[] = [];
  let state = seed >>> 0;
  for (let i = 0; i < count; i += 1) {
    const [value, next] = nextRandom(state);
    values.push(value);
    state = next;
  }
  return values;
}

describe('nextRandom', () => {
  it('returns 10,000 values all in [0, 1)', () => {
    for (const value of chain(42, 10_000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('returns the same sequence for the same seed', () => {
    expect(chain(42, 100)).toEqual(chain(42, 100));
  });

  it('returns different first values for seeds 42 and 43', () => {
    expect(nextRandom(42)[0]).not.toBe(nextRandom(43)[0]);
  });

  it('matches the mulberry32 reference implementation', () => {
    const reference = referenceMulberry32(42);
    expect(nextRandom(42)[0]).toBe(reference());
    const rest = Array.from({ length: 999 }, () => reference());
    expect(chain(42, 1000).slice(1)).toEqual(rest);
  });

  it('returns a state that is an integer in [0, 2^32)', () => {
    let state = 2 ** 32 - 1; // the largest seed: the next draw must wrap
    for (let i = 0; i < 1000; i += 1) {
      state = nextRandom(state)[1];
      expect(Number.isInteger(state)).toBe(true);
      expect(state).toBeGreaterThanOrEqual(0);
      expect(state).toBeLessThan(2 ** 32);
    }
  });
});

describe('createRng', () => {
  it('produces the same sequence as chaining nextRandom from the same seed', () => {
    const rng = createRng(42);
    const values = Array.from({ length: 1000 }, () => rng.next());
    expect(values).toEqual(chain(42, 1000));
  });

  it('gives the same sequence to two instances with the same seed', () => {
    const a = createRng(7);
    const b = createRng(7);
    for (let i = 0; i < 100; i += 1) {
      expect(a.next()).toBe(b.next());
    }
  });
});

describe('parseSeed', () => {
  it.each([
    ['?seed=42', 42],
    ['?seed=4294967295', 4294967295], // MAX_SEED itself
    ['?seed=0', 0],
    ['?seed=007', 7], // leading zeros are still a whole number
    ['seed=42', 42], // no leading '?'
    ['?other=1&seed=9', 9],
    ['?seed=42&seed=43', 42], // the first value wins
  ])('reads %s as %d', (search, expected) => {
    expect(parseSeed(search)).toBe(expected);
  });

  it.each([
    '?seed=4294967296', // MAX_SEED + 1
    '?seed=99999999999999999999', // beyond Number.MAX_SAFE_INTEGER
    '?seed=abc',
    '?seed=-5',
    '?seed=4.2',
    '?seed=1e3',
    '?seed=',
    '?seed=%2042', // decodes to ' 42'
    '?seed=42%20',
    '?seed=+42', // '+' decodes to a space
    '?other=1',
    '',
  ])('treats %j as no seed', (search) => {
    expect(parseSeed(search)).toBeUndefined();
  });
});
