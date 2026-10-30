import { describe, expect, it } from 'vitest';
import {
  GAME_OVER_TEXT,
  HINT_TEXT,
  HI_LABEL,
  HUD_FONT,
  LAYER_ORDER,
  backingSize,
  createLayerStack,
} from '../src/render.js';
import { formatScore } from '../src/score.js';
import { fakeContext } from './helpers.js';
import type { Call, FakeContext } from './helpers.js';
import { Sprites } from '../src/sprites.js';
import {
  CANDY_TIME_TEXT,
  CANVAS,
  DINO_X,
  GROUND_Y,
  HUD,
  PALETTE,
  START_SPEED,
} from '../src/tuning.js';
import type {
  Bat,
  GameState,
  LayerName,
  Obstacle,
  ObstacleKind,
} from '../src/types.js';

const dinoStand = Sprites.dinoStand;

/** A hand-built idle start-screen state (no createGame: wave 1.C rule 2). */
function idleState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: 'idle',
    tick: 0,
    seed: null,
    speed: START_SPEED,
    scrollX: 0,
    score: 0,
    hi: null,
    dino: {
      x: DINO_X,
      y: GROUND_Y - dinoStand.height,
      width: dinoStand.width,
      height: dinoStand.height,
      onGround: true,
      pose: 'stand',
      frame: 0,
      hitbox: {
        x: DINO_X + dinoStand.hitbox.x,
        y: GROUND_Y - dinoStand.height + dinoStand.hitbox.y,
        width: dinoStand.hitbox.width,
        height: dinoStand.hitbox.height,
      },
    },
    obstacles: [],
    bats: [],
    hat: null,
    candies: [],
    hearts: 0,
    candyTime: false,
    invulnTicks: 0,
    spawnLog: [],
    hud: {
      hint: 'start',
      gameOver: false,
      blinkVisible: true,
      dinoVisible: true,
    },
    ...overrides,
  };
}

/** A hand-built obstacle standing on the ground at `x`, sized from its sprite. */
function obstacle(id: number, kind: ObstacleKind, x: number): Obstacle {
  const sprite = kind === 'small' ? Sprites.cactusSmall : Sprites.cactusLarge;
  const y = GROUND_Y - sprite.height;
  return {
    id,
    group: id,
    kind,
    x,
    y,
    width: sprite.width,
    height: sprite.height,
    hitbox: {
      x: x + sprite.hitbox.x,
      y: y + sprite.hitbox.y,
      width: sprite.hitbox.width,
      height: sprite.hitbox.height,
    },
  };
}

/** A running state with one small and one large cactus ahead of the dino. */
function stateWithCacti(): GameState {
  const base = idleState();
  return idleState({
    phase: 'running',
    tick: 90,
    dino: { ...base.dino, pose: 'run', frame: 1 },
    obstacles: [obstacle(0, 'small', 300), obstacle(1, 'large', 512.5)],
    hud: { hint: null, gameOver: false, blinkVisible: true, dinoVisible: true },
  });
}

type FillRect = Extract<Call, { op: 'fillRect' }>;

/** The fillRects of each layer callback, in run order, split at save/restore. */
function rectsPerCallback(ctx: FakeContext): FillRect[][] {
  const groups: FillRect[][] = [];
  let current: FillRect[] | null = null;
  for (const call of ctx.calls) {
    if (call.op === 'save') {
      current = [];
    } else if (call.op === 'restore') {
      if (current !== null) groups.push(current);
      current = null;
    } else if (call.op === 'fillRect' && current !== null) {
      current.push(call);
    }
  }
  return groups;
}

function spriteRects(
  sprite: (typeof Sprites)[keyof typeof Sprites],
  x: number,
  y: number,
): FillRect[] {
  return [...sprite.runs, ...sprite.glowRuns].map((run) => ({
    op: 'fillRect',
    x: x + run.x,
    y: y + run.y,
    w: run.width,
    h: run.height,
  }));
}

function texts(ctx: FakeContext): string[] {
  return ctx.calls.flatMap((c) => (c.op === 'fillText' ? [c.text] : []));
}

function marks(ctx: FakeContext): string[] {
  return ctx.calls.flatMap((c) => (c.op === 'mark' ? [c.label] : []));
}

describe('createLayerStack', () => {
  it('runs layers in the fixed order whatever the registration order', () => {
    const stack = createLayerStack();
    const ctx = fakeContext();
    for (const layer of [...LAYER_ORDER].reverse()) {
      stack.addLayer(layer, () => ctx.calls.push({ op: 'mark', label: layer }));
    }

    stack.run(ctx, idleState());

    expect(marks(ctx)).toEqual([
      'background',
      'parallax',
      'world',
      'foreground',
      'hud',
    ]);
  });

  it('runs callbacks within a layer in registration order, after the built-ins', () => {
    const stack = createLayerStack();
    const ctx = fakeContext();
    stack.addLayer('hud', () => ctx.calls.push({ op: 'mark', label: 'a' }));
    stack.addLayer('hud', () => ctx.calls.push({ op: 'mark', label: 'b' }));

    stack.run(ctx, idleState());

    expect(marks(ctx)).toEqual(['a', 'b']);
    const hintAt = ctx.calls.findIndex(
      (c) => c.op === 'fillText' && c.text === HINT_TEXT.start,
    );
    const firstMark = ctx.calls.findIndex((c) => c.op === 'mark');
    expect(hintAt).toBeGreaterThanOrEqual(0);
    expect(hintAt).toBeLessThan(firstMark);
  });

  it('wraps every callback in save and restore', () => {
    const stack = createLayerStack();
    const ctx = fakeContext();
    stack.addLayer('foreground', () =>
      ctx.calls.push({ op: 'mark', label: 'fg' }),
    );

    stack.run(ctx, idleState());

    const ops = ctx.calls.map((c) => c.op);
    const at = ops.indexOf('mark');
    expect(ops[at - 2]).toBe('save');
    expect(ops[at - 1]).toBe('translate');
    expect(ops[at + 1]).toBe('restore');
    // 6 built-ins + 1 test callback, balanced.
    expect(ops.filter((op) => op === 'save')).toHaveLength(7);
    expect(ops.filter((op) => op === 'restore')).toHaveLength(7);
  });

  it('unsubscribes a callback', () => {
    const stack = createLayerStack();
    const ctx = fakeContext();
    const off = stack.addLayer('background', () =>
      ctx.calls.push({ op: 'mark', label: 'bg' }),
    );
    off();

    stack.run(ctx, idleState());

    expect(marks(ctx)).toEqual([]);
  });

  it('translates only parallax, world and foreground by the camera offset', () => {
    const stack = createLayerStack();
    const ctx = fakeContext();
    stack.setCamera(() => ({ x: 3, y: -2 }));
    const translatedBy = new Map<LayerName, boolean>();
    for (const layer of LAYER_ORDER) {
      stack.addLayer(layer, () => {
        const ops = ctx.calls;
        const prev = ops[ops.length - 1];
        translatedBy.set(
          layer,
          prev?.op === 'translate' && prev.x === 3 && prev.y === -2,
        );
      });
    }

    stack.run(ctx, idleState());

    expect(Object.fromEntries(translatedBy)).toEqual({
      background: false,
      parallax: true,
      world: true,
      foreground: true,
      hud: false,
    });
  });

  it('passes a render-frame counter that advances once per run', () => {
    const stack = createLayerStack();
    const ctx = fakeContext();
    const seen: number[] = [];
    const cameraSeen: number[] = [];
    stack.setCamera((_state, frame) => {
      cameraSeen.push(frame.count);
      return { x: 0, y: 0 };
    });
    stack.addLayer('hud', (_ctx, _state, frame) => seen.push(frame.count));

    stack.run(ctx, idleState());
    stack.run(ctx, idleState());
    stack.run(ctx, idleState());

    expect(seen).toEqual([0, 1, 2]);
    expect(cameraSeen).toEqual([0, 1, 2]);
  });
});

describe('built-in drawers', () => {
  it('sets fillStyle only to PALETTE values', () => {
    const palette: unknown[] = Object.values(PALETTE);
    for (const state of [
      idleState(),
      idleState({
        hud: {
          hint: 'restart',
          gameOver: true,
          blinkVisible: true,
          dinoVisible: true,
        },
      }),
      idleState({ tick: 37, score: 1234 }),
      idleState({ score: 1234, hi: 5678 }),
      stateWithCacti(),
    ]) {
      const ctx = fakeContext();
      createLayerStack().run(ctx, state);
      const styles = ctx.calls.flatMap((c) =>
        c.op === 'fillStyle' ? [c.value] : [],
      );
      expect(styles.length).toBeGreaterThan(0);
      for (const style of styles) {
        expect(palette).toContain(style);
      }
    }
  });

  it('draws the start hint for hint "start" and nothing for null', () => {
    const start = fakeContext();
    createLayerStack().run(start, idleState());
    expect(texts(start)).toContain(HINT_TEXT.start);
    expect(HINT_TEXT.start).toBe('Press SPACE to start');

    const restart = fakeContext();
    createLayerStack().run(
      restart,
      idleState({
        hud: {
          hint: 'restart',
          gameOver: true,
          blinkVisible: true,
          dinoVisible: true,
        },
      }),
    );
    expect(texts(restart)).toContain('Press SPACE to restart');

    const none = fakeContext();
    createLayerStack().run(
      none,
      idleState({
        hud: {
          hint: null,
          gameOver: false,
          blinkVisible: true,
          dinoVisible: true,
        },
      }),
    );
    expect(texts(none)).toEqual([formatScore(0)]);
  });

  it('draws the score with formatScore in the HUD font, right-aligned at the top right', () => {
    const ctx = fakeContext();
    createLayerStack().run(ctx, idleState({ score: 42 }));
    const score = ctx.calls.find(
      (c) => c.op === 'fillText' && c.text === '00042',
    );
    expect(score).toBeDefined();
    if (score?.op === 'fillText') {
      expect(score.x).toBeGreaterThan(CANVAS.width / 2);
      expect(score.x).toBeLessThanOrEqual(CANVAS.width);
      expect(score.y).toBeLessThan(CANVAS.height / 4);
      expect(score.x).toBe(HUD.right);
      expect(score.y).toBe(HUD.top);
    }
    expect(ctx.calls).toContainEqual({ op: 'font', value: HUD_FONT });
  });

  it('hides the score while blinkVisible is false', () => {
    const ctx = fakeContext();
    createLayerStack().run(
      ctx,
      idleState({
        score: 100,
        hud: {
          hint: null,
          gameOver: false,
          blinkVisible: false,
          dinoVisible: true,
        },
      }),
    );
    expect(texts(ctx)).toEqual([]);
  });

  it('draws the dino as fillRects over its sprite runs at its state position', () => {
    const state = idleState();
    const ctx = fakeContext();
    createLayerStack().run(ctx, state);
    const rects = ctx.calls.filter((c) => c.op === 'fillRect');
    for (const run of dinoStand.runs) {
      expect(rects).toContainEqual({
        op: 'fillRect',
        x: state.dino.x + run.x,
        y: state.dino.y + run.y,
        w: run.width,
        h: run.height,
      });
    }
  });

  it.each([
    ['stand', 0, 'dinoStand'],
    ['stand', 1, 'dinoStand'],
    ['run', 0, 'dinoRun0'],
    ['run', 1, 'dinoRun1'],
    ['hit', 0, 'dinoHit'],
  ] as const)(
    'draws pose %s frame %i with exactly the %s runs',
    (pose, frame, spriteName) => {
      const base = idleState();
      const state = idleState({
        phase: pose === 'stand' ? 'idle' : pose === 'run' ? 'running' : 'dead',
        dino: { ...base.dino, pose, frame },
      });
      const ctx = fakeContext();
      createLayerStack().run(ctx, state);
      // The dino sits on the ground; everything above GROUND_Y is the dino.
      const dinoRects = ctx.calls.filter(
        (c) => c.op === 'fillRect' && c.y < GROUND_Y,
      );
      const sprite = Sprites[spriteName];
      expect(dinoRects).toEqual(
        sprite.runs.map((run) => ({
          op: 'fillRect',
          x: state.dino.x + run.x,
          y: state.dino.y + run.y,
          w: run.width,
          h: run.height,
        })),
      );
    },
  );

  it('wraps the ground offset modulo the tile width', () => {
    const tile = Sprites.ground;
    const firstRun = tile.runs[0];
    if (firstRun === undefined) throw new Error('ground has no runs');
    const firstGroundX = (state: GameState): number | undefined => {
      const ctx = fakeContext();
      createLayerStack().run(ctx, state);
      const line = ctx.calls.find(
        (c) =>
          c.op === 'fillRect' && c.y === GROUND_Y && c.w === firstRun.width,
      );
      return line?.op === 'fillRect' ? line.x : undefined;
    };

    // 120 px scrolled: one full tile plus 56 px.
    expect(firstGroundX(idleState({ scrollX: 120 }))).toBe(-56);
    // A whole number of tiles scrolled lines the tiles up at x = 0 again.
    expect(firstGroundX(idleState({ scrollX: tile.width * 3 }))).toBe(0);
    // Fractional distances round to whole pixels.
    expect(firstGroundX(idleState({ scrollX: 10.6 }))).toBe(-11);
  });

  it('scrolls the ground by scrollX, not by tick * speed, so it keeps pace with the cacti while speed ramps', () => {
    const tile = Sprites.ground;
    const firstRun = tile.runs[0];
    if (firstRun === undefined) throw new Error('ground has no runs');
    const ctx = fakeContext();
    // tick * speed would be 2700 * 9 = 24300 px (offset 44); the world has moved 20250 px.
    createLayerStack().run(
      ctx,
      idleState({ phase: 'running', tick: 2700, speed: 9, scrollX: 20250 }),
    );
    const line = ctx.calls.find(
      (c) => c.op === 'fillRect' && c.y === GROUND_Y && c.w === firstRun.width,
    );
    expect(line?.op === 'fillRect' ? line.x : undefined).toBe(
      -(20250 % tile.width),
    );
  });

  it('tiles the ground across the canvas, scrolled by scrollX', () => {
    const tile = Sprites.ground;
    const firstRun = tile.runs[0];
    expect(firstRun).toBeDefined();
    if (firstRun === undefined) return;

    const groundLineXs = (state: GameState): number[] => {
      const ctx = fakeContext();
      createLayerStack().run(ctx, state);
      return ctx.calls.flatMap((c) =>
        c.op === 'fillRect' && c.y === GROUND_Y && c.w === firstRun.width
          ? [c.x]
          : [],
      );
    };

    const still = groundLineXs(idleState());
    expect(still[0]).toBe(0);
    expect(still).toHaveLength(Math.ceil(CANVAS.width / tile.width));

    const offset = (5 * START_SPEED) % tile.width;
    const moved = groundLineXs(idleState({ scrollX: 5 * START_SPEED }));
    expect(moved[0]).toBe(-offset);
    expect(Math.max(...moved) + tile.width).toBeGreaterThanOrEqual(
      CANVAS.width,
    );
  });

  it('draws the obstacles between the ground and the dino in the world layer', () => {
    const state = stateWithCacti();
    const ctx = fakeContext();
    createLayerStack().run(ctx, state);

    // World callbacks run first among the built-ins (hud draws text only).
    const [ground, obstacles, dino] = rectsPerCallback(ctx);
    expect(ground?.length).toBeGreaterThan(0);
    expect(ground?.every((r) => r.y >= GROUND_Y)).toBe(true);
    expect(obstacles?.length).toBeGreaterThan(0);
    expect(dino).toEqual(
      spriteRects(Sprites.dinoRun1, state.dino.x, state.dino.y),
    );
  });

  it('draws each obstacle from its kind at its rounded x and y, and nothing else', () => {
    const state = stateWithCacti();
    const [small, large] = state.obstacles;
    if (small === undefined || large === undefined)
      throw new Error('fixture has two obstacles');
    const ctx = fakeContext();
    createLayerStack().run(ctx, state);

    const obstacles = rectsPerCallback(ctx)[1];
    expect(obstacles).toEqual([
      ...spriteRects(Sprites.cactusSmall, small.x, small.y),
      // 512.5 snaps to the pixel grid (spec 2.9).
      ...spriteRects(Sprites.cactusLarge, Math.round(large.x), large.y),
    ]);
  });

  it('fills obstacle runs with PALETTE.fg and their glow runs with PALETTE.accent', () => {
    const state = stateWithCacti();
    const ctx = fakeContext();
    createLayerStack().run(ctx, state);

    const styleOfRect = new Map<string, unknown>();
    let style: unknown = null;
    for (const c of ctx.calls) {
      if (c.op === 'fillStyle') style = c.value;
      else if (c.op === 'fillRect')
        styleOfRect.set(`${String(c.x)},${String(c.y)},${String(c.w)}`, style);
    }
    for (const [sprite, x, y] of [
      [Sprites.pumpkinSmall, 300, GROUND_Y - Sprites.pumpkinSmall.height],
      [Sprites.pumpkinLarge, 513, GROUND_Y - Sprites.pumpkinLarge.height],
    ] as const) {
      expect(sprite.glowRuns.length).toBeGreaterThan(0);
      for (const run of sprite.runs) {
        const key = `${String(x + run.x)},${String(y + run.y)},${String(run.width)}`;
        expect(styleOfRect.get(key)).toBe(PALETTE.fg);
      }
      for (const run of sprite.glowRuns) {
        const key = `${String(x + run.x)},${String(y + run.y)},${String(run.width)}`;
        expect(styleOfRect.get(key)).toBe(PALETTE.accent);
      }
    }
  });

  it('draws each bat from its wing frame on the world layer, glow runs in accent, and the duck pose from its frame', () => {
    const base = idleState();
    const bat = (wing: 0 | 1, x: number): Bat => {
      const sprite = wing === 0 ? Sprites.bat0 : Sprites.bat1;
      return {
        id: wing,
        wing,
        x,
        y: 120.4,
        width: sprite.width,
        height: sprite.height,
        hitbox: { x, y: 120.4, width: 1, height: 1 },
      };
    };
    const state = idleState({
      phase: 'running',
      dino: { ...base.dino, pose: 'duck', frame: 1 },
      bats: [bat(0, 300.4), bat(1, 500)],
      hud: {
        hint: null,
        gameOver: false,
        blinkVisible: true,
        dinoVisible: true,
      },
    });
    const ctx = fakeContext();
    createLayerStack().run(ctx, state);

    const [, bats, dino] = rectsPerCallback(ctx);
    expect(dino).toEqual(
      spriteRects(Sprites.dinoDuck1, state.dino.x, state.dino.y),
    );
    expect(bats).toEqual([
      ...spriteRects(Sprites.bat0, 300, 120),
      ...spriteRects(Sprites.bat1, 500, 120),
    ]);
    expect(Sprites.bat0.glowRuns.length).toBeGreaterThan(0);
    const accentIndex = ctx.calls.findIndex(
      (c) => c.op === 'fillStyle' && c.value === PALETTE.accent,
    );
    expect(accentIndex).toBeGreaterThanOrEqual(0);
  });

  it('draws the hat and candies in the world callback, after the bats', () => {
    const hat = {
      x: 400.4,
      y: 150,
      width: Sprites.hat.width,
      height: Sprites.hat.height,
      hitbox: { x: 400, y: 150, width: 1, height: 1 },
    };
    const candy = {
      id: 0,
      x: 600,
      y: 200.6,
      width: Sprites.candy.width,
      height: Sprites.candy.height,
      hitbox: { x: 600, y: 201, width: 1, height: 1 },
    };
    const ctx = fakeContext();
    createLayerStack().run(ctx, idleState({ hat, candies: [candy] }));
    expect(rectsPerCallback(ctx)[1]).toEqual([
      ...spriteRects(Sprites.hat, 400, 150),
      ...spriteRects(Sprites.candy, 600, 201),
    ]);
  });

  it('draws one accent heart per heart top-left, clear of the score and hint', () => {
    const none = fakeContext();
    createLayerStack().run(none, idleState());
    const ctx = fakeContext();
    createLayerStack().run(ctx, idleState({ hearts: 2 }));
    const base = rectsPerCallback(none)[3] ?? [];
    const hud = rectsPerCallback(ctx)[3] ?? [];
    expect(base).toEqual([]);
    const step = Sprites.heart.width + HUD.heartGap;
    expect(hud).toEqual([
      ...spriteRects(Sprites.heart, HUD.heartsX, HUD.heartsY),
      ...spriteRects(Sprites.heart, HUD.heartsX + step, HUD.heartsY),
    ]);
    for (const r of hud) {
      expect(r.x + r.w).toBeLessThan(HUD.right - 5 * HUD.charWidth);
      expect(r.y + r.h).toBeLessThan(HUD.hintY);
    }
    const fg = ctx.calls.some(
      (c) => c.op === 'fillStyle' && c.value === PALETTE.accent,
    );
    expect(fg).toBe(true);
  });

  it('shows the candy time mark only while candyTime is on', () => {
    const off = fakeContext();
    createLayerStack().run(off, idleState({ hearts: 1 }));
    expect(texts(off)).not.toContain(CANDY_TIME_TEXT);
    const on = fakeContext();
    createLayerStack().run(on, idleState({ hearts: 1, candyTime: true }));
    expect(texts(on)).toContain(CANDY_TIME_TEXT);
    const styles = on.calls.flatMap((c) =>
      c.op === 'fillStyle' ? [c.value] : [],
    );
    for (const style of styles) {
      expect(Object.values(PALETTE)).toContain(style);
    }
  });

  it('skips the dino while hud.dinoVisible is false', () => {
    const base = idleState();
    const ctx = fakeContext();
    createLayerStack().run(
      ctx,
      idleState({ hud: { ...base.hud, dinoVisible: false } }),
    );
    expect(rectsPerCallback(ctx)[2]).toEqual([]);
  });

  it('draws no obstacle rects when there are no obstacles', () => {
    const ctx = fakeContext();
    createLayerStack().run(ctx, idleState());
    expect(rectsPerCallback(ctx)[1]).toEqual([]);
  });
});

describe('game over screen (functional spec 2.5)', () => {
  /** A hand-built dead state: hit pose, frozen obstacle, final score kept. */
  function deadState(): GameState {
    const base = idleState();
    return idleState({
      phase: 'dead',
      tick: 312,
      score: 87,
      dino: { ...base.dino, pose: 'hit', frame: 0 },
      obstacles: [obstacle(0, 'small', DINO_X + 30)],
      hud: {
        hint: 'restart',
        gameOver: true,
        blinkVisible: true,
        dinoVisible: true,
      },
    });
  }

  type FillText = Extract<Call, { op: 'fillText' }>;

  function textCall(ctx: FakeContext, text: string): FillText | undefined {
    return ctx.calls.find(
      (c): c is FillText => c.op === 'fillText' && c.text === text,
    );
  }

  it('draws the dino with the dinoHit runs', () => {
    const state = deadState();
    const ctx = fakeContext();
    createLayerStack().run(ctx, state);
    const dino = rectsPerCallback(ctx)[2];
    expect(dino).toEqual(
      spriteRects(Sprites.dinoHit, state.dino.x, state.dino.y),
    );
  });

  it('draws "GAME OVER" centred, above the ground, with the restart hint below it', () => {
    const ctx = fakeContext();
    createLayerStack().run(ctx, deadState());

    expect(GAME_OVER_TEXT).toBe('GAME OVER');
    const gameOver = textCall(ctx, GAME_OVER_TEXT);
    const hint = textCall(ctx, HINT_TEXT.restart);
    expect(HINT_TEXT.restart).toBe('Press SPACE to restart');
    if (gameOver === undefined || hint === undefined)
      throw new Error('expected both GAME OVER and the restart hint');

    expect(gameOver.x).toBe(CANVAS.width / 2);
    expect(hint.x).toBe(CANVAS.width / 2);
    expect(gameOver).toMatchObject({ x: HUD.centreX, y: HUD.gameOverY });
    expect(hint).toMatchObject({ x: HUD.centreX, y: HUD.hintY });
    expect(gameOver.y).toBeLessThan(hint.y);
    expect(hint.y).toBeLessThan(GROUND_Y);
  });

  it('paints GAME OVER centre-aligned in a bold monospace font in PALETTE.fg', () => {
    const ctx = fakeContext();
    const seen: { align: string; font: string; style: unknown }[] = [];
    const recording: FakeContext = {
      ...ctx,
      calls: ctx.calls,
      fillText(text, x, y) {
        if (text === GAME_OVER_TEXT) {
          seen.push({
            align: recording.textAlign,
            font: recording.font,
            style: recording.fillStyle,
          });
        }
        ctx.fillText(text, x, y);
      },
    };
    createLayerStack().run(recording, deadState());
    expect(seen).toHaveLength(1);
    expect(seen[0]?.align).toBe('center');
    expect(seen[0]?.font).toMatch(/^bold \d+px monospace$/);
    expect(seen[0]?.style).toBe(PALETTE.fg);
  });

  it('keeps the final score visible at the top right', () => {
    const ctx = fakeContext();
    createLayerStack().run(ctx, deadState());
    const score = textCall(ctx, formatScore(87));
    expect(score).toBeDefined();
    expect(score?.x).toBeGreaterThan(CANVAS.width / 2);
    expect(score?.y).toBeLessThan(CANVAS.height / 4);
  });

  it.each([
    ['idle', idleState()],
    ['running', stateWithCacti()],
  ] as const)('draws no GAME OVER while %s', (_name, state) => {
    const ctx = fakeContext();
    createLayerStack().run(ctx, state);
    expect(texts(ctx)).not.toContain(GAME_OVER_TEXT);
  });
});

describe('pixel grid (functional spec 2.9)', () => {
  /** A running state with cacti at fractional x and the dino mid-jump at fractional y. */
  function fractionalState(): GameState {
    const base = idleState();
    return idleState({
      phase: 'running',
      tick: 437,
      speed: 7.3125,
      dino: { ...base.dino, y: 171.6625, onGround: false, pose: 'stand' },
      obstacles: [obstacle(0, 'small', 694.3811), obstacle(1, 'large', 402.5)],
      hud: {
        hint: null,
        gameOver: false,
        blinkVisible: true,
        dinoVisible: true,
      },
    });
  }

  it('passes only whole-pixel x and y to every fillRect', () => {
    const ctx = fakeContext();
    createLayerStack().run(ctx, fractionalState());
    const rects = ctx.calls.filter((c) => c.op === 'fillRect');
    expect(rects.length).toBeGreaterThan(0);
    const offGrid = rects.filter(
      (r) => !Number.isInteger(r.x) || !Number.isInteger(r.y),
    );
    expect(offGrid).toEqual([]);
  });

  it('draws sprites at the rounded origin plus run offsets, leaving state untouched', () => {
    const state = fractionalState();
    const [small, large] = state.obstacles;
    if (small === undefined || large === undefined)
      throw new Error('fixture has two obstacles');
    const ctx = fakeContext();
    createLayerStack().run(ctx, state);

    const [, obstacles, dino] = rectsPerCallback(ctx);
    expect(obstacles).toEqual([
      ...spriteRects(Sprites.cactusSmall, 694, Math.round(small.y)),
      ...spriteRects(
        Sprites.cactusLarge,
        Math.round(large.x),
        Math.round(large.y),
      ),
    ]);
    expect(dino).toEqual(
      spriteRects(Sprites.dinoStand, Math.round(state.dino.x), 172),
    );
    expect(small.x).toBe(694.3811);
    expect(state.dino.y).toBe(171.6625);
  });

  it('rounds a fractional camera offset before translating', () => {
    const stack = createLayerStack();
    stack.setCamera(() => ({ x: 2.4, y: -1.6 }));
    const ctx = fakeContext();
    stack.run(ctx, fractionalState());
    const translates = ctx.calls.filter((c) => c.op === 'translate');
    expect(translates.length).toBeGreaterThan(0);
    for (const t of translates) {
      expect(t).toEqual({ op: 'translate', x: 2, y: -2 });
    }
  });
});

describe('HI and score line (functional spec 2.1, 2.6)', () => {
  type FillText = Extract<Call, { op: 'fillText' }>;

  interface PaintedText extends FillText {
    readonly align: string;
    readonly baseline: string;
    readonly style: unknown;
    readonly font: string;
  }

  /** Runs the stack and records each fillText with the context state it was painted in. */
  function paint(state: GameState): PaintedText[] {
    const ctx = fakeContext();
    const painted: PaintedText[] = [];
    const recording: FakeContext = {
      ...ctx,
      calls: ctx.calls,
      fillText(text, x, y) {
        painted.push({
          op: 'fillText',
          text,
          x,
          y,
          align: recording.textAlign,
          baseline: recording.textBaseline,
          style: recording.fillStyle,
          font: recording.font,
        });
      },
    };
    createLayerStack().run(recording, state);
    return painted;
  }

  const running = (
    overrides: Partial<GameState>,
    blinkVisible = true,
  ): GameState =>
    idleState({
      phase: 'running',
      tick: 400,
      score: 42,
      hud: { hint: null, gameOver: false, blinkVisible, dinoVisible: true },
      ...overrides,
    });

  const hiTexts = (painted: PaintedText[]): PaintedText[] =>
    painted.filter((t) => t.text.startsWith(HI_LABEL));

  it('draws no HI when no best score has ever been recorded', () => {
    const painted = paint(running({ hi: null }));
    expect(HI_LABEL).toBe('HI');
    expect(hiTexts(painted)).toEqual([]);
    expect(painted.map((t) => t.text)).toEqual([formatScore(42)]);
  });

  it('draws "HI 00123" left of the score, on the same line, both right-aligned', () => {
    const painted = paint(running({ hi: 123 }));
    const score = painted.find((t) => t.text === '00042');
    const hi = painted.find((t) => t.text === 'HI 00123');
    if (score === undefined || hi === undefined)
      throw new Error('expected both the score and the HI text');

    expect(score).toMatchObject({ x: HUD.right, y: HUD.top, align: 'right' });
    expect(hi.align).toBe('right');
    expect(hi.y).toBe(score.y);
    expect(hi.baseline).toBe(score.baseline);
    // HI's right edge sits a gap before the score's left edge.
    const scoreLeft = score.x - score.text.length * HUD.charWidth;
    expect(hi.x).toBe(scoreLeft - HUD.hiGap);
    expect(hi.x).toBeLessThan(score.x);
    expect(hi.x - hi.text.length * HUD.charWidth).toBeGreaterThan(
      CANVAS.width / 2,
    );
  });

  it('formats the best score as five digits', () => {
    expect(hiTexts(paint(running({ hi: 0 })))[0]?.text).toBe('HI 00000');
    expect(hiTexts(paint(running({ hi: 99999 })))[0]?.text).toBe('HI 99999');
  });

  it('hides only the score while blinking; HI stays at the same place', () => {
    const steady = hiTexts(paint(running({ hi: 123 })));
    const painted = paint(running({ hi: 123 }, false));
    expect(painted.map((t) => t.text)).toEqual(['HI 00123']);
    expect(hiTexts(painted)).toEqual(steady);
  });

  it('paints HI in PALETTE.fg and the HUD font', () => {
    for (const blinkVisible of [true, false]) {
      const [hi] = hiTexts(paint(running({ hi: 7 }, blinkVisible)));
      expect(hi).toMatchObject({ style: PALETTE.fg, font: HUD_FONT });
    }
  });

  it('keeps HI next to the final score on the game-over screen', () => {
    const painted = paint(
      idleState({
        phase: 'dead',
        score: 87,
        hi: 87,
        hud: {
          hint: 'restart',
          gameOver: true,
          blinkVisible: true,
          dinoVisible: true,
        },
      }),
    );
    expect(painted.map((t) => t.text)).toEqual(
      expect.arrayContaining(['00087', 'HI 00087', GAME_OVER_TEXT]),
    );
  });
});

describe('HUD layout constants', () => {
  it('places the top-right line inside the canvas and the centred texts above the ground', () => {
    expect(HUD.right).toBeLessThanOrEqual(CANVAS.width);
    expect(HUD.top).toBeLessThan(CANVAS.height / 4);
    expect(HUD.centreX).toBe(CANVAS.width / 2);
    expect(HUD.gameOverY).toBeLessThan(HUD.hintY);
    expect(HUD.hintY).toBeLessThan(GROUND_Y);
    expect(HUD.charWidth).toBeGreaterThan(0);
    expect(HUD.hiGap).toBeGreaterThan(0);
  });
});

describe('backingSize (functional spec 2.9: the game area fits small windows)', () => {
  it.each([
    [800, 1, 800, 300],
    [800, 2, 1600, 600],
    [368, 1, 368, 138],
    [360, 2, 720, 270],
    [343.5, 3, 1031, 387],
  ])(
    'a %d px wide canvas at device pixel ratio %d gets a %d by %d backing store',
    (cssWidth, dpr, width, height) => {
      expect(backingSize(cssWidth, dpr)).toEqual({ width, height });
    },
  );

  it('never returns an empty backing store', () => {
    expect(backingSize(0, 2)).toEqual({ width: 1, height: 1 });
  });
});
