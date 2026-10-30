// The canvas renderer (technical considerations 2.5, architecture 2.2 "Draw in layers").
//
// Split for testability: `createLayerStack()` and the built-in drawers only
// need a `DrawContext`, so tests drive them with a recording fake in Node.
// `createRenderer(canvas)` adds the frame preamble, which needs the real
// canvas context (transform, smoothing, clear). Rendering reads state and
// never mutates it or emits.

import { assertNever } from './assert.js';
import { formatScore } from './score.js';
import { Sprites, obstacleSprite, type Sprite } from './sprites.js';
import {
  CANDY_TIME_FONT,
  CANDY_TIME_TEXT,
  CANVAS,
  GROUND_Y,
  HUD,
  PALETTE,
} from './tuning.js';
import type {
  DrawContext,
  GameState,
  LayerDraw,
  LayerName,
  RenderFrame,
} from './types.js';

/** Layers run in this order every frame. */
export const LAYER_ORDER = [
  'background',
  'parallax',
  'world',
  'foreground',
  'hud',
] as const satisfies readonly LayerName[];

/** Layers translated by the camera offset; `background` and `hud` never move. */
const CAMERA_LAYERS: ReadonlySet<LayerName> = new Set([
  'parallax',
  'world',
  'foreground',
]);

/** HUD hint keys from `GameState` mapped to the text painted for them. */
export const HINT_TEXT = {
  start: 'Press SPACE to start',
  restart: 'Press SPACE to restart',
} as const satisfies Record<NonNullable<GameState['hud']['hint']>, string>;

/** HUD font (technical considerations 2.5). */
export const HUD_FONT = 'bold 16px monospace';

/** The game-over banner text and its (slightly larger) font. */
export const GAME_OVER_TEXT = 'GAME OVER';
export const GAME_OVER_FONT = 'bold 24px monospace';

/** The label painted before the best score, as in `HI 00123`. */
export const HI_LABEL = 'HI';

export interface CameraOffset {
  readonly x: number;
  readonly y: number;
}

export type CameraFn = (state: GameState, frame: RenderFrame) => CameraOffset;

/** The DOM-free core of the renderer: layer registry, camera and frame counter. */
export interface LayerStack {
  addLayer(layer: LayerName, draw: LayerDraw): () => void;
  setCamera(fn: CameraFn): void;
  /** Runs every layer once against `ctx` and advances the render-frame counter. */
  run(ctx: DrawContext, state: GameState): void;
  /** Removes every layer callback, built-ins included. */
  clear(): void;
}

export interface Renderer {
  addLayer(layer: LayerName, draw: LayerDraw): () => void;
  setCamera(fn: CameraFn): void;
  draw(state: GameState): void;
  dispose(): void;
}

const NO_CAMERA: CameraFn = () => ({ x: 0, y: 0 });

/**
 * Fills a sprite's pixel runs with `PALETTE.fg` and its glow runs with
 * `PALETTE.accent`, its top-left corner at (x, y)
 * snapped to whole logical pixels. State keeps exact float positions; only the
 * drawing is snapped, so no run lands between pixels and gets anti-aliased
 * grey edges (functional spec 2.9: one dark grey on one near-white).
 */
export function drawSprite(
  ctx: DrawContext,
  sprite: Sprite,
  x: number,
  y: number,
): void {
  const originX = Math.round(x);
  const originY = Math.round(y);
  ctx.fillStyle = PALETTE.fg;
  for (const run of sprite.runs) {
    ctx.fillRect(originX + run.x, originY + run.y, run.width, run.height);
  }
  ctx.fillStyle = PALETTE.accent;
  for (const run of sprite.glowRuns) {
    ctx.fillRect(originX + run.x, originY + run.y, run.width, run.height);
  }
}

/**
 * Ground tiles along `GROUND_Y`, scrolled by `scrollX` modulo the tile width.
 * `scrollX` is the distance the cacti have moved, so the ground keeps pace
 * with them while the speed ramps (`tick * speed` would run ahead).
 */
export const drawGround: LayerDraw = (ctx, state) => {
  const tile = Sprites.ground;
  // Whole pixels: `scrollX` is a sum of fractional speeds.
  const offset = Math.round(state.scrollX) % tile.width;
  for (let x = -offset; x < CANVAS.width; x += tile.width) {
    drawSprite(ctx, tile, x, GROUND_Y);
  }
};

/** The dino sprite for a pose and run frame. */
export function dinoSprite(dino: GameState['dino']): Sprite {
  switch (dino.pose) {
    case 'stand':
      return Sprites.dinoStand;
    case 'hit':
      return Sprites.dinoHit;
    case 'run':
      return dino.frame === 0 ? Sprites.dinoRun0 : Sprites.dinoRun1;
    case 'duck':
      return dino.frame === 0 ? Sprites.dinoDuck0 : Sprites.dinoDuck1;
    default:
      return assertNever(dino.pose);
  }
}

/** Every bat at its state position, wing frame from `bat.wing`; the eyes glow via `drawSprite`. */
export const drawBats: LayerDraw = (ctx, state) => {
  for (const bat of state.bats) {
    drawSprite(ctx, bat.wing === 0 ? Sprites.bat0 : Sprites.bat1, bat.x, bat.y);
  }
};

/** The witch's hat, when there is one, and every candy at its state position. */
export const drawPickups: LayerDraw = (ctx, state) => {
  if (state.hat !== null) {
    drawSprite(ctx, Sprites.hat, state.hat.x, state.hat.y);
  }
  for (const candy of state.candies) {
    drawSprite(ctx, Sprites.candy, candy.x, candy.y);
  }
};

/** Every obstacle at its state position, its sprite chosen from `kind`, then the bats and pickups. */
export const drawObstacles: LayerDraw = (ctx, state, frame) => {
  for (const obstacle of state.obstacles) {
    drawSprite(ctx, obstacleSprite(obstacle.kind), obstacle.x, obstacle.y);
  }
  drawBats(ctx, state, frame);
  drawPickups(ctx, state, frame);
};

/** The dinosaur at its state position, its sprite chosen from `pose` and `frame`. */
export const drawDino: LayerDraw = (ctx, state) => {
  if (!state.hud.dinoVisible) {
    return;
  }
  drawSprite(ctx, dinoSprite(state.dino), state.dino.x, state.dino.y);
};

/**
 * One heart per `state.hearts` top-left, in accent (the sprite's glow runs),
 * and a small "candy time" mark under them while `state.candyTime` is set.
 */
export const drawHearts: LayerDraw = (ctx, state) => {
  for (let i = 0; i < state.hearts; i += 1) {
    drawSprite(
      ctx,
      Sprites.heart,
      HUD.heartsX + i * (Sprites.heart.width + HUD.heartGap),
      HUD.heartsY,
    );
  }
  if (state.candyTime) {
    ctx.fillStyle = PALETTE.accent;
    ctx.font = CANDY_TIME_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(CANDY_TIME_TEXT, HUD.candyMarkX, HUD.candyMarkY);
  }
};

/**
 * The top-right score line, as in `HI 00123  00042`: the five-digit score
 * right-aligned at `HUD.right`, and, only when a best score exists, `HI` and
 * the best score right-aligned `HUD.hiGap` px left of the score's start. The
 * score is hidden while blinking; the HI stays steady. With no `measureText`,
 * the score's width is its length times `HUD.charWidth` (monospace font).
 */
export const drawScore: LayerDraw = (ctx, state, frame) => {
  drawHearts(ctx, state, frame);
  const score = formatScore(state.score);
  ctx.fillStyle = PALETTE.fg;
  ctx.font = HUD_FONT;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  if (state.hud.blinkVisible) {
    ctx.fillText(score, HUD.right, HUD.top);
  }
  if (state.hi !== null) {
    const hiRight = HUD.right - score.length * HUD.charWidth - HUD.hiGap;
    ctx.fillText(`${HI_LABEL} ${formatScore(state.hi)}`, hiRight, HUD.top);
  }
};

/** The hint for `hud.hint`, centred; nothing when there is no hint. */
export const drawHint: LayerDraw = (ctx, state) => {
  const { hint } = state.hud;
  if (hint === null) {
    return;
  }
  ctx.fillStyle = PALETTE.fg;
  ctx.font = HUD_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(HINT_TEXT[hint], HUD.centreX, HUD.hintY);
};

/** "GAME OVER", centred above the hint, while `hud.gameOver` is set. */
export const drawGameOver: LayerDraw = (ctx, state) => {
  if (!state.hud.gameOver) {
    return;
  }
  ctx.fillStyle = PALETTE.fg;
  ctx.font = GAME_OVER_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(GAME_OVER_TEXT, HUD.centreX, HUD.gameOverY);
};

/**
 * Creates the layer stack with the built-in drawers already registered through
 * `addLayer`: in `world`, ground, obstacles, dino; in `hud`, score, hint, then game over.
 */
export function createLayerStack(): LayerStack {
  const layers = new Map<LayerName, LayerDraw[]>(
    LAYER_ORDER.map((name) => [name, []]),
  );
  let camera = NO_CAMERA;
  let count = 0;

  function callbacksOf(layer: LayerName): LayerDraw[] {
    const callbacks = layers.get(layer);
    if (callbacks === undefined) {
      throw new Error(`Unknown render layer '${layer}'`);
    }
    return callbacks;
  }

  function addLayer(layer: LayerName, draw: LayerDraw): () => void {
    const callbacks = callbacksOf(layer);
    // Wrap so the same function registered twice is removed one entry at a time.
    const entry: LayerDraw = (ctx, state, frame) => {
      draw(ctx, state, frame);
    };
    callbacks.push(entry);
    return () => {
      const index = callbacks.indexOf(entry);
      if (index >= 0) {
        callbacks.splice(index, 1);
      }
    };
  }

  function run(ctx: DrawContext, state: GameState): void {
    const frame: RenderFrame = { count };
    const camOffset = camera(state, frame);
    // Snapped so a fractional shake cannot move layers off the pixel grid.
    const offset = { x: Math.round(camOffset.x), y: Math.round(camOffset.y) };
    for (const layer of LAYER_ORDER) {
      const moves = CAMERA_LAYERS.has(layer);
      // Copy, so a callback that unsubscribes mid-frame does not skip a sibling.
      for (const draw of [...callbacksOf(layer)]) {
        ctx.save();
        if (moves) {
          ctx.translate(offset.x, offset.y);
        }
        try {
          draw(ctx, state, frame);
        } finally {
          ctx.restore();
        }
      }
    }
    count += 1;
  }

  const stack: LayerStack = {
    addLayer,
    setCamera(fn) {
      camera = fn;
    },
    run,
    clear() {
      for (const callbacks of layers.values()) {
        callbacks.length = 0;
      }
    },
  };

  stack.addLayer('world', drawGround);
  stack.addLayer('world', drawObstacles);
  stack.addLayer('world', drawDino);
  stack.addLayer('hud', drawScore);
  stack.addLayer('hud', drawHint);
  stack.addLayer('hud', drawGameOver);
  return stack;
}

/**
 * Backing-store size, in device pixels, for a canvas displayed `cssWidth` CSS
 * pixels wide on a screen with `dpr` device pixels per CSS pixel. The height
 * keeps the 800 by 300 shape, so the renderer's single scale
 * (`canvas.width / CANVAS.width`) fits both axes (functional spec 2.9).
 */
export function backingSize(
  cssWidth: number,
  dpr: number,
): { width: number; height: number } {
  const width = Math.max(1, Math.round(cssWidth * dpr));
  const height = Math.max(
    1,
    Math.round((width * CANVAS.height) / CANVAS.width),
  );
  return { width, height };
}

/**
 * The browser renderer. Each `draw` sets the transform from
 * `canvas.width / CANVAS.width`, disables smoothing and clears to `PALETTE.bg`
 * (in that order, since resizing the canvas resets the first two), then runs
 * the layers in logical 800 by 300 coordinates.
 */
export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('createRenderer: the canvas has no 2D context');
  }
  const stack = createLayerStack();
  let isDisposed = false;

  return {
    addLayer: (layer, draw) => stack.addLayer(layer, draw),
    setCamera: (fn) => {
      stack.setCamera(fn);
    },
    draw(state) {
      if (isDisposed) {
        return;
      }
      const scale = canvas.width / CANVAS.width;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = PALETTE.bg;
      ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);
      stack.run(ctx, state);
    },
    dispose() {
      isDisposed = true;
      stack.clear();
    },
  };
}
