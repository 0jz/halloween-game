// Browser entry point (technical considerations 2.6). This is the only place that
// wires the pure game to the real world: the clock, randomness, localStorage,
// the canvas and requestAnimationFrame. Everything else stays testable in Node.

import { createBus } from './events.js';
import { installNightSky } from './features/night-sky.js';
import { installPuddle } from './features/puddle.js';
import { createGame } from './game.js';
import { createKeyboard } from './input.js';
import { attachKeyboard } from './input-dom.js';
import { backingSize, createRenderer } from './render.js';
import { parseSeed } from './rng.js';
import { createMemoryStore, createStorageStore } from './store.js';
import type { HighScoreStore } from './types.js';

/** The one localStorage key the game owns (architecture section 3). */
const HI_STORAGE_KEY = 'dino.hi';

/**
 * High score kept in localStorage (technical considerations 2.7). Touching
 * localStorage can throw (private mode, disabled storage); if it does, the
 * game keeps its best score in memory for this page only.
 */
function createLocalStorageStore(): HighScoreStore {
  let storage: Storage;
  try {
    storage = window.localStorage;
    storage.getItem(HI_STORAGE_KEY); // touching it is what throws when disabled
  } catch {
    return createMemoryStore();
  }
  return createStorageStore(storage, HI_STORAGE_KEY);
}

/** Finds `canvas#game`, narrowing the type with a runtime check instead of a cast. */
function findCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector('canvas#game');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Dino Runner: <canvas id="game"> not found in index.html');
  }
  return canvas;
}

/**
 * Keeps the canvas backing store matched to its displayed size. CSS decides
 * how big the game area is on screen (up to 800 by 300, shrinking to fit small
 * windows); this sets the backing store to that size times the screen's pixel
 * density so drawing stays sharp, and the renderer scales the logical 800 by
 * 300 scene onto it. Re-runs when the element is resized and when the pixel
 * ratio changes (zoom, moving to another monitor). Assigning width or height
 * clears the canvas; the next animation frame redraws it.
 */
function fitCanvas(canvas: HTMLCanvasElement): void {
  const fit = (): void => {
    const dpr = window.devicePixelRatio || 1;
    const size = backingSize(canvas.getBoundingClientRect().width, dpr);
    if (canvas.width !== size.width) canvas.width = size.width;
    if (canvas.height !== size.height) canvas.height = size.height;
  };
  const watchPixelRatio = (): void => {
    const dpr = window.devicePixelRatio || 1;
    window.matchMedia(`(resolution: ${String(dpr)}dppx)`).addEventListener(
      'change',
      () => {
        fit();
        watchPixelRatio();
      },
      { once: true },
    );
  };
  fit();
  watchPixelRatio();
  new ResizeObserver(fit).observe(canvas);
}

// 1. Seed from the URL (`?seed=N`). Undefined means every run draws a random seed.
const seed = parseSeed(location.search);

// 2. High-score storage.
const store = createLocalStorageStore();

// 3. The game itself. `randomSeed` is only called when a run starts.
const bus = createBus();
const game = createGame({
  seed,
  randomSeed: () => Math.floor(Math.random() * 2 ** 32),
  store,
  bus,
});

// 4. Canvas, renderer and keyboard. Listeners live on window, so the canvas
// needs no focus; each intent is queued for the next step.
const canvas = findCanvas();
fitCanvas(canvas);
const renderer = createRenderer(canvas);
// Cosmetic features plug in from outside the game loop (architecture 2.2).
installNightSky({ game, renderer });
installPuddle({ game, renderer });
// Attached once for the page's lifetime: attaching again on a restart would
// stack listeners, and one key press would then queue one intent per run so far.
attachKeyboard(window, createKeyboard(), (intent) => {
  game.dispatch(intent);
});

// 5. Read-only hook for end-to-end tests. Frozen so page code cannot replace it.
window.__dino = Object.freeze({
  state: () => game.state(),
  seed,
  version: 1,
});

// 6. Animation loop. Re-arm first: if a frame throws, the next one still runs.
function loop(): void {
  requestAnimationFrame(loop);
  game.frame(performance.now());
  renderer.draw(game.view());
}
requestAnimationFrame(loop);
