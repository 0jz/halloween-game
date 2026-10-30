// The night sky (functional spec 2.2 and 2.3): darkness, moon, stars, clouds
// and eyes on the background layer. Driven through a real game and the real
// layer stack, drawn into a recording context that also notes globalAlpha.

import { describe, expect, it } from 'vitest';
import {
  cloudX,
  eyesActive,
  installNightSky,
  moonBounce,
  nightLevel,
  starCount,
} from '../src/features/night-sky.js';
import { createLayerStack } from '../src/render.js';
import {
  CANVAS,
  CLOUD_COUNT,
  EYES_PAIRS,
  GROUND_Y,
  NIGHT_DARKEST_TICK,
  NIGHT_DARKER_TICK,
  NIGHT_EYES_TICK,
  NIGHT_MAX_ALPHA,
  NIGHT_STARS_TICK,
  PALETTE,
  STARS_BASE,
  STARS_EXTRA,
} from '../src/tuning.js';
import type { DrawContext, GameState, LayerName } from '../src/types.js';
import {
  makeGame,
  pressPrimary,
  runUntil,
  type MakeGameOptions,
} from './helpers.js';

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly style: unknown;
  readonly alpha: number;
}

const noop = (): void => undefined;

function recordingContext(rects: Rect[]): DrawContext {
  let style: DrawContext['fillStyle'] = '#000000';
  let alpha = 1;
  return {
    get fillStyle() {
      return style;
    },
    set fillStyle(value) {
      style = value;
    },
    get globalAlpha() {
      return alpha;
    },
    set globalAlpha(value) {
      alpha = value;
    },
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    fillRect(x, y, w, h) {
      rects.push({ x, y, w, h, style, alpha });
    },
    fillText: noop,
    translate: noop,
    save: noop,
    restore: noop,
  };
}

function setup(seed?: number, options?: MakeGameOptions) {
  const { game } = makeGame(seed, options);
  const stack = createLayerStack();
  const layers: LayerName[] = [];
  const renderer = {
    addLayer: (
      layer: LayerName,
      draw: Parameters<typeof stack.addLayer>[1],
    ) => {
      layers.push(layer);
      return stack.addLayer(layer, draw);
    },
  };
  const dispose = installNightSky({ game, renderer });
  function render(state: GameState = game.view()): readonly Rect[] {
    const rects: Rect[] = [];
    stack.run(recordingContext(rects), state);
    return rects;
  }
  return { game, layers, render, dispose };
}

const small = (rects: readonly Rect[]) =>
  rects.filter((r) => r.w === 2 && r.h === 2);
const stars = (rects: readonly Rect[]) =>
  small(rects).filter((r) => r.style !== PALETTE.accent);
const eyes = (rects: readonly Rect[]) =>
  small(rects).filter((r) => r.style === PALETTE.accent);
const clouds = (rects: readonly Rect[]) =>
  rects.filter((r) => r.w === 40 && r.h === 6);
const overlay = (rects: readonly Rect[]) =>
  rects.filter((r) => r.w === CANVAS.width && r.h === CANVAS.height);
const moon = (rects: readonly Rect[]) =>
  rects.filter((r) => r.style === PALETTE.moon && r.w > 2);
const pos = (rects: readonly Rect[]) => rects.map((r) => [r.x, r.y]);

/** A seeded game that never dies, run past the eyes milestone. */
function nightGame(seed: number) {
  const s = setup(seed, { deps: { collisions: false } });
  pressPrimary(s.game);
  runUntil(s.game, (st) => st.tick >= NIGHT_EYES_TICK + 200, 6000);
  return s;
}

describe('night sky pure functions', () => {
  it('nightLevel is 0 at the start, rising, and 1 from full night on', () => {
    expect(nightLevel(0)).toBe(0);
    expect(nightLevel(NIGHT_DARKER_TICK)).toBeGreaterThan(nightLevel(0));
    expect(nightLevel(NIGHT_DARKEST_TICK)).toBeGreaterThan(
      nightLevel(NIGHT_DARKER_TICK),
    );
    expect(nightLevel(NIGHT_DARKEST_TICK)).toBe(1);
    expect(nightLevel(NIGHT_DARKEST_TICK * 3)).toBe(1);
  });

  it('starCount starts at STARS_BASE (at least 3) and grows to the full set', () => {
    expect(starCount(0)).toBeGreaterThanOrEqual(3);
    expect(starCount(0)).toBe(STARS_BASE);
    expect(starCount(NIGHT_STARS_TICK + 180)).toBeGreaterThan(starCount(0));
    expect(starCount(NIGHT_STARS_TICK + 180)).toBe(STARS_BASE + STARS_EXTRA);
    expect(starCount(NIGHT_STARS_TICK + 90)).toBeLessThan(
      starCount(NIGHT_STARS_TICK + 180),
    );
  });

  it('eyesActive flips at NIGHT_EYES_TICK', () => {
    expect(eyesActive(NIGHT_EYES_TICK - 1)).toBe(false);
    expect(eyesActive(NIGHT_EYES_TICK)).toBe(true);
    expect(eyesActive(NIGHT_EYES_TICK + 500)).toBe(true);
  });

  it('cloudX drifts left and re-enters from the right edge', () => {
    for (let i = 0; i < CLOUD_COUNT; i += 1) {
      let wrapped = false;
      let last = cloudX(i, 0);
      for (let f = 1; f < 20000; f += 1) {
        const x = cloudX(i, f);
        expect(x).toBeGreaterThanOrEqual(-40);
        expect(x).toBeLessThan(CANVAS.width);
        if (x > last) {
          wrapped = true;
          expect(x).toBeGreaterThan(CANVAS.width - 10);
        }
        last = x;
      }
      expect(wrapped).toBe(true);
      expect(cloudX(i, 0)).not.toBe(cloudX(i, 300));
    }
  });

  it('moonBounce moves the moon, then is 0 once settled', () => {
    expect(Math.min(...[3, 5, 10, 15].map(moonBounce))).toBeLessThan(0);
    expect(moonBounce(20)).toBe(0);
    expect(moonBounce(500)).toBe(0);
  });
});

describe('night sky layer', () => {
  it('registers one layer, on background', () => {
    expect(setup(42).layers).toEqual(['background']);
  });

  it('draws a moon, at least 3 stars and a clear overlay at tick 0', () => {
    const rects = setup(42).render();
    expect(moon(rects).length).toBeGreaterThan(0);
    expect(stars(rects).length).toBeGreaterThanOrEqual(3);
    expect(clouds(rects)).toHaveLength(CLOUD_COUNT);
    expect(eyes(rects)).toEqual([]);
    expect(overlay(rects).map((r) => r.alpha)).toEqual([0]);
  });

  it('darkens to NIGHT_MAX_ALPHA, adds stars and eyes, as the run goes on', () => {
    const s = nightGame(7);
    runUntil(s.game, (st) => st.tick >= NIGHT_DARKEST_TICK, 6000);
    const rects = s.render();
    expect(overlay(rects).map((r) => r.alpha)).toEqual([NIGHT_MAX_ALPHA]);
    expect(stars(rects)).toHaveLength(STARS_BASE + STARS_EXTRA);
    expect(eyes(rects).length).toBeGreaterThan(0);
    expect(eyes(rects).length).toBeLessThanOrEqual(EYES_PAIRS * 2);
  });

  it('keeps stars and eyes in the upper sky, off the ground and the score', () => {
    const s = nightGame(11);
    for (const r of [...stars(s.render()), ...eyes(s.render())]) {
      expect(r.y).toBeGreaterThanOrEqual(10);
      expect(r.y + r.h).toBeLessThan(GROUND_Y - 100);
      expect(r.x >= 0 && r.x + r.w <= CANVAS.width).toBe(true);
      expect(r.x + r.w > 600 && r.y < 40).toBe(false);
    }
  });

  it('keeps clouds drifting after the game ended', () => {
    const { game, render } = setup(42);
    pressPrimary(game);
    runUntil(game, (s) => s.phase === 'dead', 600);
    const first = clouds(render());
    for (let i = 0; i < 200; i += 1) render();
    const later = clouds(render());
    expect(first).toHaveLength(CLOUD_COUNT);
    expect(later).toHaveLength(CLOUD_COUNT);
    expect(pos(later)).not.toEqual(pos(first));
  });

  it('bounces the moon after a jump and settles back', () => {
    const { game, render } = setup(42);
    pressPrimary(game);
    const resting = moon(render()).map((r) => r.y);
    game.dispatch('primary');
    game.tick();
    const frames = Array.from({ length: 30 }, () => moon(render())[0]?.y ?? 0);
    expect(Math.min(...frames)).toBeLessThan(resting[0] ?? 0);
    expect(moon(render()).map((r) => r.y)).toEqual(resting);
  });

  it('draws only PALETTE colours', () => {
    const s = nightGame(5);
    const palette: unknown[] = Object.values(PALETTE);
    for (const r of s.render()) expect(palette).toContain(r.style);
  });

  it('places stars and eyes the same for the same seed, differently for another', () => {
    const a = nightGame(3).render();
    const b = nightGame(3).render();
    const c = nightGame(4).render();
    expect(pos(stars(a))).toEqual(pos(stars(b)));
    expect(pos(stars(a))).not.toEqual(pos(stars(c)));
    expect(pos(eyes(a)).length).toBeGreaterThan(0);
    expect(pos(eyes(a))).toEqual(pos(eyes(b)));
    expect(pos(eyes(a))).not.toEqual(pos(eyes(c)));
  });

  it('rebuilds the pool and clears the darkness on restart', () => {
    const s = setup(undefined, {
      seeds: [5, 9],
      deps: { collisions: true },
    });
    pressPrimary(s.game);
    const first = pos(stars(s.render()));
    s.game.dispatch('primary');
    runUntil(s.game, (st) => st.phase === 'dead', 600);
    pressPrimary(s.game);
    expect(s.game.view().tick).toBeLessThan(5);
    const rects = s.render();
    expect(pos(stars(rects))).not.toEqual(first);
    expect(overlay(rects).map((r) => r.alpha)).toEqual([0]);
  });

  it('draws nothing after dispose', () => {
    const { render, dispose } = setup(42);
    dispose();
    expect(overlay(render())).toEqual([]);
    expect(moon(render())).toEqual([]);
  });
});
