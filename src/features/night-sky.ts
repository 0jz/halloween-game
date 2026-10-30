// The night sky (spec 002, functional spec 2.2 and 2.3): the sky darkens as a
// run goes on, a moon, stars, drifting clouds and glowing eyes appear.
//
// A cosmetic feature in the puddle.ts shape: installed from outside the game
// loop, state in a closure, reset on `start` and `restart`, only draws. Clouds,
// blinking and the moon bounce use the render frame counter (the simulation is
// frozen on the game-over screen, the sky is not); darkness and the star and
// eye milestones use the tick counter.

import type { Renderer } from '../render.js';
import { createRng } from '../rng.js';
import {
  CANVAS,
  CLOUD_COUNT,
  EYES_PAIRS,
  NIGHT_DARKEST_TICK,
  NIGHT_EYES_TICK,
  NIGHT_MAX_ALPHA,
  NIGHT_SALT,
  NIGHT_STARS_TICK,
  PALETTE,
  STARS_BASE,
  STARS_EXTRA,
} from '../tuning.js';
import type { Game, LayerDraw } from '../types.js';

export interface NightSkyDeps {
  readonly game: Pick<Game, 'on'>;
  readonly renderer: Pick<Renderer, 'addLayer'>;
}

/** Ticks over which the extra stars appear after NIGHT_STARS_TICK. */
const STARS_GROW_TICKS = 180;

/** Stars and eyes stay inside this band of the sky, in logical px. */
const SKY_TOP = 10;
const SKY_BOTTOM = 150;

/** The score text sits top-right; nothing is placed there. */
const SCORE_AREA = { x: 600, y: 40 } as const;

const CLOUD_WIDTH = 40;
const CLOUD_Y = [50, 90, 70, 110] as const;
/** Frames the moon takes to settle after a jump. */
const MOON_BOUNCE_FRAMES = 20;
const MOON_BOUNCE_PX = 4;
const MOON = { x: 700, y: 62, radius: 12 } as const;

/** Eyes blink: closed for this many frames out of every cycle. */
const BLINK_CYCLE = 120;
const BLINK_CLOSED = 8;

/** 0 in daylight, 1 at full night. */
export function nightLevel(tick: number): number {
  return Math.min(1, Math.max(0, tick / NIGHT_DARKEST_TICK));
}

/** Stars shown at a tick: STARS_BASE, growing to STARS_BASE + STARS_EXTRA. */
export function starCount(tick: number): number {
  if (tick < NIGHT_STARS_TICK) return STARS_BASE;
  const progress = Math.min(1, (tick - NIGHT_STARS_TICK) / STARS_GROW_TICKS);
  return STARS_BASE + Math.floor(STARS_EXTRA * progress);
}

export function eyesActive(tick: number): boolean {
  return tick >= NIGHT_EYES_TICK;
}

/** Left edge of cloud `index` at a render frame; wraps from left back to right. */
export function cloudX(index: number, frameCount: number): number {
  const span = CANVAS.width + CLOUD_WIDTH;
  const speed = 0.15 + 0.05 * index;
  const start = (index * span) / CLOUD_COUNT + 60;
  const raw = (start - frameCount * speed) % span;
  return Math.floor((raw < 0 ? raw + span : raw) - CLOUD_WIDTH);
}

/** Vertical moon offset in px, `age` frames after a jump; 0 once settled. */
export function moonBounce(age: number): number {
  if (age < 0 || age >= MOON_BOUNCE_FRAMES) return 0;
  return -Math.round(
    MOON_BOUNCE_PX * Math.sin((Math.PI * age) / MOON_BOUNCE_FRAMES),
  );
}

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Pool {
  readonly stars: readonly Point[];
  readonly eyes: readonly Point[];
}

function buildPool(seed: number | null): Pool {
  const rng = createRng(((seed ?? 0) ^ NIGHT_SALT) >>> 0);
  const stars: Point[] = [];
  for (let i = 0; i < STARS_BASE + STARS_EXTRA; i += 1) {
    const x = Math.floor(rng.next() * (CANVAS.width - 2));
    let y = SKY_TOP + Math.floor(rng.next() * (SKY_BOTTOM - SKY_TOP));
    if (x + 2 > SCORE_AREA.x && y < SCORE_AREA.y) y += SCORE_AREA.y;
    stars.push({ x, y });
  }
  const eyes: Point[] = [];
  for (let i = 0; i < EYES_PAIRS; i += 1) {
    const x = 40 + Math.floor(rng.next() * (SCORE_AREA.x - 80));
    const y = 60 + Math.floor(rng.next() * (SKY_BOTTOM - 60));
    eyes.push({ x, y });
  }
  return { stars, eyes };
}

/** Installs the night sky; the returned function removes it again. */
export function installNightSky({ game, renderer }: NightSkyDeps): () => void {
  let pool: Pool | null = null;
  // Render frame of the latest jump; `jumped` marks one not yet stamped.
  let startedAt: number | null = null;
  let jumped = false;

  const reset = (seed: number | null) => {
    pool = buildPool(seed);
    startedAt = null;
    jumped = false;
  };

  const draw: LayerDraw = (ctx, state, frame) => {
    pool ??= buildPool(state.seed);
    if (jumped) {
      startedAt = frame.count;
      jumped = false;
    }

    // 1. Darkness overlay.
    ctx.fillStyle = PALETTE.skyDark;
    ctx.globalAlpha = nightLevel(state.tick) * NIGHT_MAX_ALPHA;
    ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);
    ctx.globalAlpha = 1;

    // 2. Moon: a pixel disc of 2 px rows.
    const bounce = startedAt === null ? 0 : moonBounce(frame.count - startedAt);
    ctx.fillStyle = PALETTE.moon;
    for (let dy = -MOON.radius; dy < MOON.radius; dy += 2) {
      const half = Math.floor(
        Math.sqrt(MOON.radius * MOON.radius - (dy + 1) * (dy + 1)),
      );
      ctx.fillRect(MOON.x - half, MOON.y + dy + bounce, half * 2, 2);
    }

    // 3. Stars.
    const shown = starCount(state.tick);
    pool.stars.slice(0, shown).forEach((star, i) => {
      ctx.fillStyle = i % 3 === 0 ? PALETTE.moon : PALETTE.dim;
      ctx.fillRect(star.x, star.y, 2, 2);
    });

    // 4. Clouds, drifting with the render frame so they move on game over too.
    ctx.fillStyle = PALETTE.dim;
    for (let i = 0; i < CLOUD_COUNT; i += 1) {
      const x = cloudX(i, frame.count);
      const y = CLOUD_Y[i % CLOUD_Y.length] ?? 50;
      ctx.fillRect(x + 10, y, 20, 4);
      ctx.fillRect(x, y + 4, CLOUD_WIDTH, 6);
    }

    // 5. Eyes, blinking.
    if (eyesActive(state.tick)) {
      ctx.fillStyle = PALETTE.accent;
      pool.eyes.forEach((eye, i) => {
        if ((frame.count + i * 40) % BLINK_CYCLE < BLINK_CLOSED) return;
        ctx.fillRect(eye.x, eye.y, 2, 2);
        ctx.fillRect(eye.x + 6, eye.y, 2, 2);
      });
    }
  };

  const offStart = game.on('start', (event) => {
    reset(event.seed);
  });
  const offRestart = game.on('restart', (event) => {
    reset(event.seed);
  });
  const offJump = game.on('jump', () => {
    jumped = true;
  });
  const removeLayer = renderer.addLayer('background', draw);

  return () => {
    offStart();
    offRestart();
    offJump();
    removeLayer();
  };
}
