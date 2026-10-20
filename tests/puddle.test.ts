// The red puddle (functional spec 2.5 and 2.9, Change Log 2026-10-19): it spreads
// under the dinosaur when the run ends, stays while the game-over screen shows,
// and is gone after a restart. Driven through a real game and the real layer
// stack, drawn into a recording fake context.

import { describe, expect, it } from 'vitest';
import { installPuddle } from '../src/features/puddle.js';
import { createLayerStack } from '../src/render.js';
import { GROUND_Y, PALETTE, PUDDLE } from '../src/tuning.js';
import type { GameState } from '../src/types.js';
import {
  fakeContext,
  makeGame,
  pressPrimary,
  runUntil,
  type Call,
} from './helpers.js';

type FillRect = Extract<Call, { op: 'fillRect' }>;

/** One rendered frame: every fillRect, tagged with the fillStyle it was drawn in. */
interface Frame {
  readonly rects: readonly (FillRect & { readonly style: unknown })[];
}

function setup() {
  const { game } = makeGame(42);
  const stack = createLayerStack();
  const dispose = installPuddle({ game, renderer: stack });
  function render(state: GameState = game.view()): Frame {
    const ctx = fakeContext();
    stack.run(ctx, state);
    let style: unknown = undefined;
    const rects: (FillRect & { style: unknown })[] = [];
    for (const call of ctx.calls) {
      if (call.op === 'fillStyle') style = call.value;
      if (call.op === 'fillRect') rects.push({ ...call, style });
    }
    return { rects };
  }
  return { game, render, dispose };
}

const red = (frame: Frame) =>
  frame.rects.filter((r) => r.style === PALETTE.accent);
const widthOf = (frame: Frame) => Math.max(0, ...red(frame).map((r) => r.w));

/** Starts a run and lets it end at the first cactus (seed 42 never jumps). */
function die(game: ReturnType<typeof setup>['game']): void {
  pressPrimary(game);
  runUntil(game, (s) => s.phase === 'dead', 600);
}

describe('red puddle on game over', () => {
  it('draws nothing red on the start screen or while running', () => {
    const { game, render } = setup();
    expect(red(render())).toEqual([]);
    pressPrimary(game);
    for (let i = 0; i < 100 && game.view().phase === 'running'; i += 1) {
      expect(red(render())).toEqual([]);
      game.tick();
    }
  });

  it('appears under the dinosaur on the ground when the run ends, on whole pixels', () => {
    const { game, render } = setup();
    die(game);
    for (let i = 0; i < PUDDLE.growFrames; i += 1) render();
    const frame = render();
    const rects = red(frame);
    expect(rects.length).toBeGreaterThan(0);
    const hitbox = game.view().dino.hitbox;
    for (const r of rects) {
      for (const n of [r.x, r.y, r.w, r.h])
        expect(Number.isInteger(n)).toBe(true);
      expect(r.y).toBeGreaterThan(GROUND_Y - 6);
      expect(r.y + r.h).toBeLessThanOrEqual(GROUND_Y);
    }
    const left = Math.min(...rects.map((r) => r.x));
    const right = Math.max(...rects.map((r) => r.x + r.w));
    expect(left).toBeLessThan(hitbox.x + hitbox.width);
    expect(right).toBeGreaterThan(hitbox.x);
  });

  it('spreads over PUDDLE.growFrames frames, then stays at full size', () => {
    const { game, render } = setup();
    die(game);
    const widths: number[] = [];
    for (let i = 0; i <= PUDDLE.growFrames + 100; i += 1) {
      widths.push(widthOf(render()));
    }
    expect(widths[0]).toBeLessThan(PUDDLE.width);
    for (let i = 1; i < widths.length; i += 1) {
      expect(widths[i]).toBeGreaterThanOrEqual(widths[i - 1] ?? 0);
    }
    expect(widths.slice(PUDDLE.growFrames)).toEqual(
      new Array<number>(101).fill(PUDDLE.width),
    );
  });

  it('is gone after a restart and spreads again from small after the next crash', () => {
    const { game, render } = setup();
    die(game);
    for (let i = 0; i < PUDDLE.growFrames + 5; i += 1) render();
    expect(widthOf(render())).toBe(PUDDLE.width);

    pressPrimary(game);
    expect(game.view().phase).toBe('running');
    expect(red(render())).toEqual([]);

    runUntil(game, (s) => s.phase === 'dead', 600);
    expect(widthOf(render())).toBeLessThan(PUDDLE.width);
  });

  it('is painted before the ground and the dinosaur, so it reads as under them', () => {
    const { game, render } = setup();
    die(game);
    for (let i = 0; i < PUDDLE.growFrames; i += 1) render();
    const { rects } = render();
    const firstRed = rects.findIndex((r) => r.style === PALETTE.accent);
    const firstGrey = rects.findIndex((r) => r.style === PALETTE.fg);
    expect(firstRed).toBeGreaterThanOrEqual(0);
    expect(firstRed).toBeLessThan(firstGrey);
  });

  it('draws nothing after dispose, even on the game-over screen', () => {
    const { game, render, dispose } = setup();
    die(game);
    dispose();
    for (let i = 0; i < PUDDLE.growFrames + 5; i += 1) {
      expect(red(render())).toEqual([]);
    }
  });
});
