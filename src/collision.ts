// Axis-aligned hitbox collision. Pure: no DOM, no state.
//
// Overlap is strict: two rectangles that only share an edge (a.x + a.width ===
// b.x, or the same on y) do NOT intersect. A touching edge has zero overlapping
// area, so there is still no shared pixel, which keeps near misses forgiving.

import type { Dino, Obstacle, Rect } from './types.js';

/** True when `a` and `b` share a region of positive area (touching edges do not count). */
export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

/**
 * True when the dino's hitbox intersects any obstacle's hitbox. The hitboxes
 * are inset from the drawn sprites, so a near miss is not a crash. Overlap is
 * strict, as in `intersects`, so a dino that only touches an obstacle's edge
 * runs on.
 */
export function hasCollision(
  dino: Dino,
  obstacles: readonly Obstacle[],
): boolean {
  return obstacles.some((obstacle) => intersects(dino.hitbox, obstacle.hitbox));
}
