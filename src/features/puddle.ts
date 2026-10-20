// The red puddle on the game-over screen (functional spec 2.5 and 2.9).
//
// A cosmetic feature in the shape architecture 2.2 describes: it is installed
// from outside the game loop, keeps its own state in a closure, resets it on
// `start` and `restart`, and only draws. It never writes to GameState and
// game.ts does not know it exists.

import type { Renderer } from '../render.js';
import { GROUND_Y, PALETTE, PUDDLE } from '../tuning.js';
import type { Game, LayerDraw } from '../types.js';

export interface PuddleDeps {
  readonly game: Pick<Game, 'on'>;
  readonly renderer: Pick<Renderer, 'addLayer'>;
}

/** Row widths of the flat pixel-art pool, top to bottom, relative to full width. */
const ROW_INSETS = [8, 2, 0, 4] as const;

/** Installs the puddle; the returned function removes it again. */
export function installPuddle({ game, renderer }: PuddleDeps): () => void {
  // Render frame at which the current puddle first appeared, or null if none.
  // Render frames, not ticks: the simulation is frozen while the game is over.
  let startedAt: number | null = null;

  const reset = () => {
    startedAt = null;
  };

  const draw: LayerDraw = (ctx, state, frame) => {
    if (state.phase !== 'dead') return;
    startedAt ??= frame.count;
    const progress = Math.min(1, (frame.count - startedAt) / PUDDLE.growFrames);
    const width = Math.round(PUDDLE.width * progress);

    const { hitbox } = state.dino;
    const centreX = Math.round(hitbox.x + hitbox.width / 2);
    const top = GROUND_Y - ROW_INSETS.length;

    ctx.fillStyle = PALETTE.accent;
    ROW_INSETS.forEach((inset, row) => {
      const rowWidth = Math.max(0, width - inset);
      if (rowWidth === 0) return;
      ctx.fillRect(centreX - Math.round(rowWidth / 2), top + row, rowWidth, 1);
    });
  };

  const offStart = game.on('start', reset);
  const offRestart = game.on('restart', reset);
  // `parallax` runs just before `world`, so the ground line and the dinosaur
  // are painted over the pool and it reads as lying under them. It also moves
  // with the camera, like everything else in the world.
  const removeLayer = renderer.addLayer('parallax', draw);

  return () => {
    offStart();
    offRestart();
    removeLayer();
  };
}
