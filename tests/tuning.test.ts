import { describe, expect, it } from 'vitest';
import {
  FIRST_ARRIVAL_TICKS,
  JUMP_DURATION_TICKS,
  MAX_SPEED,
  MAX_SPEED_AT_TICK,
  MIN_GAP_FACTOR,
  PALETTE,
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

  describe('palette (one style, spec 2.5)', () => {
    /** Hex like '#rrggbb' to hue 0-360 and saturation / lightness 0-1. */
    function hsl(hex: string): { h: number; s: number; l: number } {
      const [r = 0, g = 0, b = 0] = [1, 3, 5].map(
        (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
      );
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      const l = (max + min) / 2;
      if (d === 0) return { h: 0, s: 0, l };
      const s = d / (1 - Math.abs(2 * l - 1));
      let h: number;
      if (max === r) h = ((g - b) / d + 6) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      return { h: h * 60, s, l };
    }
    const isOrange = (hex: string): boolean => {
      const { h, s } = hsl(hex);
      return h >= 15 && h <= 40 && s >= 0.8;
    };
    const isBlueViolet = (hex: string): boolean => {
      const { h } = hsl(hex);
      return h >= 200 && h <= 280;
    };
    const isPale = (hex: string): boolean => {
      const { s, l } = hsl(hex);
      return l >= 0.8 && (s <= 0.4 || l >= 0.9);
    };

    it('has exactly one orange entry, the accent', () => {
      const orange = Object.entries(PALETTE)
        .filter(([, hex]) => isOrange(hex))
        .map(([name]) => name);
      expect(orange).toEqual(['accent']);
    });

    it('keeps the backgrounds navy or blue-violet and dark', () => {
      for (const hex of [PALETTE.bg, PALETTE.skyDark]) {
        expect(isBlueViolet(hex)).toBe(true);
        expect(hsl(hex).l).toBeLessThan(0.3);
      }
    });

    it('keeps fg, moon and dim pale grey or off-white (dim may be blue-grey)', () => {
      for (const hex of [PALETTE.fg, PALETTE.moon]) {
        expect(isPale(hex)).toBe(true);
      }
      expect(isBlueViolet(PALETTE.dim) || hsl(PALETTE.dim).s <= 0.25).toBe(
        true,
      );
    });

    it('uses no other hue: every entry is orange, blue-violet or pale', () => {
      for (const [name, hex] of Object.entries(PALETTE)) {
        expect(
          isOrange(hex) || isBlueViolet(hex) || isPale(hex),
          `${name} ${hex}`,
        ).toBe(true);
      }
    });
  });
});
