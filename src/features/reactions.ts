// The night reacts (spec 002, functional spec 2.4): a thump when the dinosaur
// lands, sparks when it jumps, an orange flash and a hard shake when it crashes,
// a spark burst every 100 points and a bat with blinking eyes every 500.
//
// A cosmetic feature in the puddle.ts shape: installed from outside the game
// loop, state in a closure, cleared on `start`, `restart` and `die`, only
// draws. Effects are stamped lazily with the render frame they first appear in
// (`startedAt ??= frame.count`), so they keep animating on the frozen game-over
// screen. It owns `renderer.setCamera`, and never writes to GameState.

import { assertNever } from '../assert.js';
import type { Renderer } from '../render.js';
import { createRng } from '../rng.js';
import {
  CANVAS,
  DINO_X,
  FLASH_ALPHA,
  FLASH_FRAMES,
  GROUND_Y,
  HUD,
  MILESTONE_EVERY,
  PALETTE,
  REACTION_SALT,
  SHAKE_DIE_FRAMES,
  SHAKE_DIE_PX,
  SHAKE_LAND_FRAMES,
  SHAKE_LAND_PX,
} from '../tuning.js';
import type { DrawContext, Game, LayerDraw, Rng } from '../types.js';

export interface ReactionsDeps {
  readonly game: Pick<Game, 'on'>;
  readonly renderer: Pick<Renderer, 'addLayer' | 'setCamera'>;
}

export type ShakeKind = 'land' | 'die';

/** Every fifth milestone (500 points) brings the bat instead of plain sparks. */
export const SCARE_EVERY = 5;
/** Render frames a spark lives; always under 30. */
export const SPARK_FRAMES = 24;
export const SCARE_FRAMES = 120;
const JUMP_SPARKS = 6;
const MILESTONE_SPARKS = 10;
/** Horizontal middle of the dinosaur's feet, in logical px. */
const FEET_X = DINO_X + 22;

export interface Offset {
  readonly x: number;
  readonly y: number;
}

export interface Particle {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

export interface ParticlePose {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly alpha: number;
}

export interface Scare {
  readonly x: number;
  readonly y: number;
  readonly wingsUp: boolean;
  readonly eyesOpen: boolean;
}

function shakeSpec(kind: ShakeKind): { px: number; frames: number } {
  switch (kind) {
    case 'land':
      return { px: SHAKE_LAND_PX, frames: SHAKE_LAND_FRAMES };
    case 'die':
      return { px: SHAKE_DIE_PX, frames: SHAKE_DIE_FRAMES };
    default:
      return assertNever(kind);
  }
}

/** Camera offset `age` frames into a shake: fades linearly, flips sign each frame. */
export function shakeOffset(kind: ShakeKind, age: number): Offset {
  const { px, frames } = shakeSpec(kind);
  if (age < 0 || age >= frames) return { x: 0, y: 0 };
  const amplitude = Math.max(1, Math.round(px * (1 - age / frames)));
  const sign = age % 2 === 0 ? 1 : -1;
  return { x: kind === 'die' ? sign * amplitude : 0, y: sign * amplitude };
}

/** Opacity of the orange crash flash `age` frames in; 0 once it is over. */
export function flashAlpha(age: number): number {
  if (age < 0 || age >= FLASH_FRAMES) return 0;
  return FLASH_ALPHA * (1 - age / FLASH_FRAMES);
}

/** `n` sparks flying up and sideways from (x, y). Draws only from `rng`. */
export function makeBurst(
  rng: Rng,
  x: number,
  y: number,
  n: number,
): Particle[] {
  const burst: Particle[] = [];
  for (let i = 0; i < n; i += 1) {
    burst.push({
      x,
      y,
      vx: (rng.next() - 0.5) * 4,
      vy: -(0.5 + rng.next() * 2.5),
    });
  }
  return burst;
}

/** Where a spark is `age` frames after the burst; null once it has burnt out. */
export function particleAt(p: Particle, age: number): ParticlePose | null {
  if (age < 0 || age >= SPARK_FRAMES) return null;
  return {
    x: Math.round(p.x + p.vx * age),
    y: Math.round(p.y + p.vy * age + 0.08 * age * age),
    size: age < SPARK_FRAMES / 2 ? 2 : 1,
    alpha: 1 - age / SPARK_FRAMES,
  };
}

/** The bat crossing the sky `age` frames after a 500-point milestone. */
export function scareAt(age: number): Scare | null {
  if (age < 0 || age >= SCARE_FRAMES) return null;
  const progress = age / SCARE_FRAMES;
  return {
    x: Math.round(CANVAS.width + 20 - progress * (CANVAS.width + 60)),
    y: 40 + Math.round(10 * Math.sin(progress * Math.PI * 4)),
    wingsUp: Math.floor(age / 6) % 2 === 0,
    eyesOpen: Math.floor(age / 10) % 4 !== 3,
  };
}

interface Stamped {
  startedAt: number | null;
}

interface ShakeEffect extends Stamped {
  readonly kind: ShakeKind;
}

interface BurstEffect extends Stamped {
  readonly particles: readonly Particle[];
}

const magnitude = (o: Offset): number => Math.abs(o.x) + Math.abs(o.y);

/** Installs the reactions; the returned function removes them again. */
export function installReactions({
  game,
  renderer,
}: ReactionsDeps): () => void {
  let rng = createRng(REACTION_SALT >>> 0);
  let shakes: ShakeEffect[] = [];
  let flash: Stamped | null = null;
  let worldBursts: BurstEffect[] = [];
  let scoreBursts: BurstEffect[] = [];
  let scare: Stamped | null = null;

  const clear = () => {
    shakes = [];
    flash = null;
    worldBursts = [];
    scoreBursts = [];
    scare = null;
  };
  const reset = (seed: number) => {
    rng = createRng((seed ^ REACTION_SALT) >>> 0);
    clear();
  };

  const ageOf = (effect: Stamped, frameCount: number): number => {
    effect.startedAt ??= frameCount;
    return frameCount - effect.startedAt;
  };

  renderer.setCamera((_state, frame) => {
    let best: Offset = { x: 0, y: 0 };
    for (const shake of shakes) {
      const offset = shakeOffset(shake.kind, ageOf(shake, frame.count));
      if (magnitude(offset) > magnitude(best)) best = offset;
    }
    shakes = shakes.filter(
      (s) =>
        s.startedAt === null ||
        frame.count - s.startedAt < shakeSpec(s.kind).frames,
    );
    return best;
  });

  const drawBursts = (
    ctx: DrawContext,
    bursts: BurstEffect[],
    frameCount: number,
  ): BurstEffect[] => {
    ctx.fillStyle = PALETTE.accent;
    for (const burst of bursts) {
      const t = ageOf(burst, frameCount);
      for (const particle of burst.particles) {
        const pose = particleAt(particle, t);
        if (pose === null) continue;
        ctx.globalAlpha = pose.alpha;
        ctx.fillRect(pose.x, pose.y, pose.size, pose.size);
      }
    }
    ctx.globalAlpha = 1;
    return bursts.filter(
      (b) => b.startedAt === null || frameCount - b.startedAt < SPARK_FRAMES,
    );
  };

  const drawFlash: LayerDraw = (ctx, _state, frame) => {
    if (flash === null) return;
    const alpha = flashAlpha(ageOf(flash, frame.count));
    if (alpha === 0) {
      flash = null;
      return;
    }
    ctx.fillStyle = PALETTE.accent;
    ctx.globalAlpha = alpha;
    ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);
    ctx.globalAlpha = 1;
  };

  const drawWorldSparks: LayerDraw = (ctx, _state, frame) => {
    worldBursts = drawBursts(ctx, worldBursts, frame.count);
  };

  const drawHud: LayerDraw = (ctx, _state, frame) => {
    scoreBursts = drawBursts(ctx, scoreBursts, frame.count);
    if (scare === null) return;
    const pose = scareAt(ageOf(scare, frame.count));
    if (pose === null) {
      scare = null;
      return;
    }
    ctx.fillStyle = PALETTE.dim;
    ctx.fillRect(pose.x, pose.y, 8, 4);
    const wingY = pose.wingsUp ? pose.y - 4 : pose.y + 4;
    ctx.fillRect(pose.x - 8, wingY, 8, 2);
    ctx.fillRect(pose.x + 8, wingY, 8, 2);
    if (pose.eyesOpen) {
      ctx.fillStyle = PALETTE.accent;
      ctx.fillRect(pose.x + 1, pose.y + 1, 2, 2);
      ctx.fillRect(pose.x + 5, pose.y + 1, 2, 2);
    }
  };

  const offs = [
    game.on('start', (e) => {
      reset(e.seed);
    }),
    game.on('restart', (e) => {
      reset(e.seed);
    }),
    game.on('jump', () => {
      worldBursts.push({
        startedAt: null,
        particles: makeBurst(rng, FEET_X, GROUND_Y, JUMP_SPARKS),
      });
    }),
    game.on('land', () => {
      shakes.push({ kind: 'land', startedAt: null });
    }),
    game.on('die', () => {
      clear();
      shakes.push({ kind: 'die', startedAt: null });
      flash = { startedAt: null };
    }),
    game.on('milestone', (e) => {
      if (e.score % (MILESTONE_EVERY * SCARE_EVERY) === 0) {
        scare = { startedAt: null };
      }
      scoreBursts.push({
        startedAt: null,
        particles: makeBurst(
          rng,
          HUD.right - 20,
          HUD.top + 8,
          MILESTONE_SPARKS,
        ),
      });
    }),
    renderer.addLayer('background', drawFlash),
    renderer.addLayer('foreground', drawWorldSparks),
    renderer.addLayer('hud', drawHud),
  ];

  return () => {
    for (const off of offs) off();
    renderer.setCamera(() => ({ x: 0, y: 0 }));
  };
}
