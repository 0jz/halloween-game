// The night reacts (functional spec 2.4): pure effect curves, plus the
// installed feature driven by a plain event bus and the real layer stack,
// drawn into a recording fake context.

import { describe, expect, it } from 'vitest';
import { createBus } from '../src/events.js';
import {
  SPARK_FRAMES,
  flashAlpha,
  installReactions,
  makeBurst,
  particleAt,
  scareAt,
  shakeOffset,
} from '../src/features/reactions.js';
import { createLayerStack } from '../src/render.js';
import { createRng } from '../src/rng.js';
import {
  FLASH_ALPHA,
  FLASH_FRAMES,
  PALETTE,
  SHAKE_DIE_FRAMES,
  SHAKE_DIE_PX,
  SHAKE_LAND_FRAMES,
  SHAKE_LAND_PX,
} from '../src/tuning.js';
import { fakeContext, makeGame, type Call } from './helpers.js';

function setup() {
  const bus = createBus();
  const stack = createLayerStack();
  stack.clear(); // drop the built-in ground, dino and HUD: only reactions draw
  const dispose = installReactions({ game: bus, renderer: stack });
  const state = makeGame(42).game.view();
  // Own, drawn-in-order record of every call plus every globalAlpha written.
  function render() {
    const ctx = fakeContext();
    const alphas: number[] = [];
    let alpha = 1;
    Object.defineProperty(ctx, 'globalAlpha', {
      get: () => alpha,
      set: (value: number) => {
        alpha = value;
        alphas.push(value);
      },
    });
    stack.run(ctx, state);
    return { calls: ctx.calls, alphas };
  }
  return { bus, stack, dispose, render };
}

const accentRects = (calls: readonly Call[]): number => {
  let style: unknown;
  let count = 0;
  for (const call of calls) {
    if (call.op === 'fillStyle') style = call.value;
    if (call.op === 'fillRect' && style === PALETTE.accent) count += 1;
  }
  return count;
};

/** Camera offset the stack applies in a frame, read back from the translate. */
function cameraOf(calls: readonly Call[]): { x: number; y: number } {
  const t = calls.find((c) => c.op === 'translate');
  return t?.op === 'translate' ? { x: t.x, y: t.y } : { x: 0, y: 0 };
}

describe('shakeOffset', () => {
  it('land shake is at most SHAKE_LAND_PX and zero by its last frame', () => {
    for (let age = 0; age < SHAKE_LAND_FRAMES; age += 1) {
      const o = shakeOffset('land', age);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(SHAKE_LAND_PX);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(SHAKE_LAND_PX);
    }
    expect(shakeOffset('land', 0)).not.toEqual({ x: 0, y: 0 });
    expect(shakeOffset('land', SHAKE_LAND_FRAMES)).toEqual({ x: 0, y: 0 });
  });

  it('die shake is stronger than the land shake and ends later', () => {
    expect(SHAKE_DIE_PX).toBeGreaterThan(SHAKE_LAND_PX);
    expect(Math.abs(shakeOffset('die', 0).y)).toBe(SHAKE_DIE_PX);
    expect(shakeOffset('die', SHAKE_DIE_FRAMES - 1)).not.toEqual({
      x: 0,
      y: 0,
    });
    expect(shakeOffset('die', SHAKE_DIE_FRAMES)).toEqual({ x: 0, y: 0 });
  });
});

describe('flashAlpha', () => {
  it('is at most FLASH_ALPHA and zero by frame 12', () => {
    for (let age = 0; age < 12; age += 1) {
      expect(flashAlpha(age)).toBeLessThanOrEqual(FLASH_ALPHA);
    }
    expect(flashAlpha(0)).toBe(FLASH_ALPHA);
    expect(flashAlpha(FLASH_FRAMES)).toBe(0);
    expect(flashAlpha(12)).toBe(0);
  });
});

describe('sparks', () => {
  it('makeBurst is deterministic for a seed and makes n sparks', () => {
    const a = makeBurst(createRng(7), 10, 20, 6);
    const b = makeBurst(createRng(7), 10, 20, 6);
    expect(a).toEqual(b);
    expect(a).toHaveLength(6);
  });

  it('every spark is gone within 30 frames', () => {
    expect(SPARK_FRAMES).toBeLessThan(30);
    for (const p of makeBurst(createRng(1), 0, 0, 20)) {
      expect(particleAt(p, 0)).not.toBeNull();
      expect(particleAt(p, 30)).toBeNull();
    }
  });
});

describe('scareAt', () => {
  it('crosses the screen and ends', () => {
    const first = scareAt(0);
    const later = scareAt(60);
    expect(first).not.toBeNull();
    expect(later?.x).toBeLessThan(first?.x ?? 0);
    expect(scareAt(10_000)).toBeNull();
  });
});

describe('installReactions', () => {
  it('draws nothing and applies no shake before anything happens', () => {
    const { render } = setup();
    const { calls } = render();
    expect(calls.filter((c) => c.op === 'fillRect')).toEqual([]);
    expect(cameraOf(calls)).toEqual({ x: 0, y: 0 });
  });

  it('a land thumps the camera, then settles within SHAKE_LAND_FRAMES', () => {
    const { bus, render } = setup();
    bus.emit({ type: 'land' });
    const first = cameraOf(render().calls);
    expect(first.y).not.toBe(0);
    expect(Math.abs(first.y)).toBeLessThanOrEqual(SHAKE_LAND_PX);
    for (let i = 1; i < SHAKE_LAND_FRAMES; i += 1) render();
    expect(cameraOf(render().calls)).toEqual({ x: 0, y: 0 });
  });

  it('a crash flashes orange at no more than FLASH_ALPHA and shakes harder', () => {
    const { bus, render } = setup();
    bus.emit({
      type: 'die',
      score: 10,
      highScore: 10,
      isNewHighScore: false,
    });
    const { calls, alphas } = render();
    expect(Math.max(...alphas.filter((a) => a < 1))).toBe(FLASH_ALPHA);
    expect(Math.abs(cameraOf(calls).y)).toBe(SHAKE_DIE_PX);
    for (let i = 1; i < 12; i += 1) render();
    expect(render().alphas.filter((a) => a < 1)).toEqual([]);
  });

  it('a jump makes sparks that are gone within 30 frames', () => {
    const { bus, render } = setup();
    bus.emit({ type: 'jump' });
    expect(accentRects(render().calls)).toBeGreaterThan(0);
    for (let i = 1; i < 30; i += 1) render();
    expect(accentRects(render().calls)).toBe(0);
  });

  it('milestone 100 gives sparks only, 500 adds the bat', () => {
    const plain = setup();
    plain.bus.emit({ type: 'milestone', score: 100 });
    const hundred = plain.render().calls.filter((c) => c.op === 'fillRect');
    const bat = setup();
    bat.bus.emit({ type: 'milestone', score: 500 });
    const fiveHundred = bat.render().calls.filter((c) => c.op === 'fillRect');
    expect(hundred.length).toBeGreaterThan(0);
    expect(fiveHundred.length).toBeGreaterThan(hundred.length);
    // After the sparks have burnt out, only the 500 bat is still on screen.
    for (let i = 1; i < 30; i += 1) {
      plain.render();
      bat.render();
    }
    expect(plain.render().calls.filter((c) => c.op === 'fillRect')).toEqual([]);
    expect(
      bat.render().calls.filter((c) => c.op === 'fillRect').length,
    ).toBeGreaterThan(0);
  });

  it('losing a heart thumps like a land, with no flash', () => {
    const { bus, render } = setup();
    bus.emit({ type: 'heartLost', hearts: 1 });
    const { calls, alphas } = render();
    expect(Math.abs(cameraOf(calls).y)).toBeLessThanOrEqual(SHAKE_LAND_PX);
    expect(cameraOf(calls).y).not.toBe(0);
    expect(alphas.filter((a) => a < 1)).toEqual([]);
    for (let i = 1; i < SHAKE_LAND_FRAMES; i += 1) render();
    expect(cameraOf(render().calls)).toEqual({ x: 0, y: 0 });
  });

  it('catching the hat and eating a candy each burst sparks that burn out', () => {
    for (const event of [
      { type: 'hatCaught' },
      { type: 'candyEaten', hearts: 1 },
    ] as const) {
      const { bus, render } = setup();
      bus.emit(event);
      expect(accentRects(render().calls)).toBeGreaterThan(0);
      for (let i = 1; i < 30; i += 1) render();
      expect(accentRects(render().calls)).toBe(0);
    }
  });

  it('clears pickup effects on restart', () => {
    const { bus, render } = setup();
    bus.emit({ type: 'hatCaught' });
    bus.emit({ type: 'heartLost', hearts: 0 });
    render();
    bus.emit({ type: 'restart', seed: 42 });
    const { calls } = render();
    expect(calls.filter((c) => c.op === 'fillRect')).toEqual([]);
    expect(cameraOf(calls)).toEqual({ x: 0, y: 0 });
  });

  it('uses only fillRect, fillStyle, globalAlpha and the layer plumbing', () => {
    const { bus, render } = setup();
    bus.emit({ type: 'jump' });
    bus.emit({ type: 'land' });
    bus.emit({ type: 'milestone', score: 500 });
    bus.emit({
      type: 'die',
      score: 500,
      highScore: 500,
      isNewHighScore: true,
    });
    const allowed = new Set([
      'fillRect',
      'fillStyle',
      'save',
      'restore',
      'translate',
    ]);
    for (let i = 0; i < 40; i += 1) {
      for (const call of render().calls)
        expect(allowed.has(call.op)).toBe(true);
    }
  });

  it('clears every effect on restart and on start', () => {
    for (const type of ['restart', 'start'] as const) {
      const { bus, render } = setup();
      bus.emit({ type: 'jump' });
      bus.emit({ type: 'land' });
      bus.emit({ type: 'milestone', score: 500 });
      bus.emit({
        type: 'die',
        score: 500,
        highScore: 500,
        isNewHighScore: false,
      });
      render();
      bus.emit({ type, seed: 42 });
      const { calls, alphas } = render();
      expect(calls.filter((c) => c.op === 'fillRect')).toEqual([]);
      expect(alphas.filter((a) => a < 1)).toEqual([]);
      expect(cameraOf(calls)).toEqual({ x: 0, y: 0 });
    }
  });

  it('dispose removes its layers', () => {
    const { bus, dispose, render } = setup();
    dispose();
    bus.emit({ type: 'jump' });
    expect(render().calls.filter((c) => c.op === 'fillRect')).toEqual([]);
  });
});
